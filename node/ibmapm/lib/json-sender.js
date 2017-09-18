// Copyright IBM Corp. 2017. All Rights Reserved.
// Node module: ibmapm
// This file is licensed under the Apache License 2.0.
// License text available at https://opensource.org/licenses/Apache-2.0

var fs = require('fs');
var https = require('https');
var http = require('http');
var url = require('url');
var crypto = require('crypto');
var restClient = require('./knj-restclient');
var senderTool = require('./tool/sender');
var aarTools = require('./tool/aartools');
var adrTools = require('./tool/adrtools');
var uuid = require('uuid');
var os = require('os');
var commonTools = require('./tool/common');

var log4js = require('log4js');
var logger = log4js.getLogger('knj_log');

function JsonSender() {
    this.socketPort = undefined;
    this.testUrl = undefined;
    this.keyfile = undefined;
    this.keyp12 = undefined;
    this.app_guid = undefined;
    this.password = undefined;
    this.app_data = undefined;
    this.isHttp = undefined;
    this.mAndA = false;
    this.oetest = false;
    this.cloudnative = false;
    this.port = 443;
    this.app_hostname = os.hostname();
    this.nodeAppMD5String = undefined;
    this.applicationName = process.env.MONITORING_APPLICATION_NAME;
    this.osMD5 = undefined;
    this.nodeEngineString = undefined;
    this.nodeEngineMD5String = undefined;
    this.nodeAppNPMString = undefined;
    this.nodeAppNPMMD5String = undefined;
    this.externalRegister = {};
    this.startTime = (new Date()).toISOString();
    this.vcap = undefined;

    this.port = 443;
    this.MA_info = { port: 443 };
    this.BM_info = { port: 443 };

    this.isAppMetricInitialized = false;
    this.environment = undefined;

    this.registeredAll = false;
    this.aarBatchForBI = {
        payload: [],
        committed: false
    };
}

var getServerPort = function() {
    var handles = global.process._getActiveHandles();
    var port = 'unknown';
    handles.forEach(function(handle) {
        if (handle.hasOwnProperty('_connectionKey')) {
            var key = handle._connectionKey;
            var terms = key.split(':');
            port = terms[terms.length - 1];
        }
    });
    return port;
};

function getServerAddress() {
    var interfaces = os.networkInterfaces();
    for (var intf in interfaces) {
        var iface = interfaces[intf];
        for (var i = 0; i < iface.length; i++) {
            var alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal)
                return alias.address;
        }
    }
    return '0.0.0.0';
}

var getDeploymentType = function() {
    var cluster = require('cluster');
    if (cluster.isWorker) return 'cluster';
    if ((cluster.isMaster) && (Object.keys(cluster.workers).length > 1)) return 'cluster';
    return 'single';
};
var _this = this;
JsonSender.prototype.register = function register() { // Register DC and Resouce
    // Prepare Node.js App related reusable strings: this.applicationName, this.nodeAppMD5String

    logger.debug('Register...');
    var nodeAppMD5;
    var applicationJson;
    if (process.env.VCAP_APPLICATION) {
        _this.vcap = applicationJson = JSON.parse(process.env.VCAP_APPLICATION);
        _this.applicationName = _this.applicationName || applicationJson.application_name;
        _this.nodeAppMD5String = _this.vcap.application_id;
    } else {
        nodeAppMD5 = crypto.createHash('md5');
        _this.applicationName = _this.applicationName || process.argv[1];
        _this.nodeAppMD5String =
            nodeAppMD5.update(_this.applicationName + ' on ' + _this.app_hostname).digest('hex');
    }
    _this.IP = getServerAddress();

    // define topology items informations

    _this.nodev8String = 'v8EngineOn' + _this.app_hostname + 'InNode' + process.version;
    _this.nodeEngineString = 'NodeEngine' + process.version + 'On' + _this.app_hostname;
    _this.nodeAppNPMString = 'NPMPkgsForApp' + _this.applicationName;
    _this.nodeGCString = 'GCOn-' + _this.app_hostname + '-For-' + _this.applicationName;
    _this.nodeELString = 'StrongLoopOn-' + _this.app_hostname + '-For-' + _this.applicationName;

    // Register DC:
    var dcMD5 = crypto.createHash('md5');
    dcMD5.update('NodeJS' + _this.applicationName + 'DC');
    _this.dcMD5String = dcMD5.digest('hex');
    var dcObj = {
        id: _this.dcMD5String,
        type: ['datacollector'],
        startTime: _this.startTime,
        displayLabel: 'NodeJS' + _this.applicationName + 'DC',
        properties: {
            name: 'NodeJS' + _this.applicationName + 'DC',
            displayName: 'NodeJS' + _this.applicationName + 'DC',
            version: '0.10.0.1',
            monitoringLevel: 'L1',
            diagnosticsEnabled: process.env.KNJ_ENABLE_DEEPDIVE,
            methodTracingEnabled: process.env.KNJ_ENABLE_METHODTRACE
        }
    };
    restClient.registerDC(dcObj);

    // register NPM Packages:
    var nodeAppNPMMD5 = crypto.createHash('md5');
    nodeAppNPMMD5.update(_this.nodeAppNPMString);
    _this.nodeAppNPMMD5String = nodeAppNPMMD5.digest('hex');
    var npmObj = {
        id: _this.nodeAppNPMMD5String,
        type: ['npm'],
        displayLabel: 'NPM Packages',
        startTime: _this.startTime,
        properties: {
            displayName: 'NPM Packages', // TODO, must unique?
            name: 'NPM Packages'
        }
    };

    if (process.mainModule.paths && process.mainModule.paths.length > 0) {
        var find = false;
        for (var i in process.mainModule.paths) {
            var packageFile = process.mainModule.paths[i].split('node_modules')[0] +
                '/' + 'package.json';
            try {
                var packageString = fs.readFileSync(packageFile);
                var packageJson = JSON.parse(packageString);
                // console.info(packageJson);
                logger.info('NPM Packages discovered: ');
                for (var key in packageJson.dependencies) {
                    logger.info('-->' + key + ': ' + packageJson.dependencies[key]);
                    npmObj.properties['dependencies.' + key] = packageJson.dependencies[key];
                }
                find = true;
                break;
                // console.info(npmObj.properties);
            } catch (e) {
                logger.info('Failed to get ' + packageFile);
            }
        }
        if (!find) {
            logger.warn('Failed to get package.json, will not generate NPM properties.');
        }
    }

    restClient.registerResource(npmObj);
};

JsonSender.prototype.init = function init(envType) {
    _this = this;
    try {
        var vcapApplication;
        if (envType === 'Cloudnative') {
            this.cloudnative = true;
            if (process.env.KNJ_CONFIG_FILE) {
                restClient.setConfiguration('./' + process.env.KNJ_CONFIG_FILE, this.register);
            } else {
                restClient.setConfiguration('./config.json', this.register);
            }

            // TODO To deleted: pretend it was on Bluemix
            if (process.env.VCAP_APPLICATION) {
                vcapApplication = JSON.parse(process.env.VCAP_APPLICATION);

                this.app_data = {
                    APP_NAME: vcapApplication['application_name'],
                    INSTANCE_ID: vcapApplication['instance_id'],
                    INSTANCE_INDEX: vcapApplication['instance_index'],
                    URI: vcapApplication['uris'],
                    START_TIME: vcapApplication['started_at'],
                    APP_PORT: vcapApplication['port']
                };
                if (process.env.APM_BM_SECURE_GATEWAY) {
                    this.app_guid = vcapApplication['application_id'];
                }
            } else {
                logger.info('JsonSender: VCAP_APPLICATION env variable not found, ' +
                    'it is not set in non-bluemix env');
            }
            // TODO To deleted end: pretend it was on Bluemix
        } else {
            this.IP = getServerAddress();
            if (process.env.VCAP_SERVICES) {
                var MAServiceName = 'MonitoringAndAnalytics';
                if (process.env.APM_MONITORING_SERVICE_NAME) {
                    MAServiceName = process.env.APM_MONITORING_SERVICE_NAME;
                }
                var env = JSON.parse(process.env.VCAP_SERVICES);
                var envKeys = Object.keys(env);
                for (var i in envKeys) {
                    var key = envKeys[i];
                    if (key.indexOf(MAServiceName) === 0) {
                        this.mAndA = true;
                        var urlString = env[key][0]['credentials']['url'];
                        this.MA_info.keyfile = env[key][0]['credentials']['pkcskey'];
                        this.MA_info.keyp12 = new Buffer(this.MA_info.keyfile, 'base64');
                        this.MA_info.password = env[key][0]['credentials']['password'];
                        this.app_guid = env[key][0]['credentials']['app_guid'];
                        this.MA_info.isHttp = false;
                        var urlMap = url.parse(urlString);
                        this.MA_info.hostname = urlMap['hostname'];
                        this.MA_info.host = urlMap['host'];
                        this.MA_info.path = urlMap['path'];
                        break;
                    }
                }

                if (!this.mAndA) {
                    logger.info('JsonSender: MonitoringAndAnalytics service not found');
                }
            } else {
                logger.info('JsonSender: VCAP_SERVICES env variable not found');
            }

            if (process.env.APM_BM_SECURE_GATEWAY || process.env.APM_BM_GATEWAY_URL ||
                process.env.MONITORING_SERVER_URL ||
                fs.existsSync(__dirname + '/../etc/global.environment')) {
                senderTool.BM_info_generator();
                this.mAndA = true;
                this.BM_info = senderTool.BM_info;
            }

            if (!this.mAndA) {
                logger.info('JsonSender: Neither MonitoringAndAnalytics service' +
                    ' nor APM_BM_SECURE_GATEWAY was found');
            }

            if (process.env.VCAP_APPLICATION ||
                fs.existsSync(__dirname + '/../etc/global.environment')) {
                if (process.env.VCAP_APPLICATION) {
                    vcapApplication = JSON.parse(process.env.VCAP_APPLICATION);

                    this.app_data = {
                        APP_NAME: vcapApplication['application_name'],
                        INSTANCE_ID: vcapApplication['instance_id'],
                        INSTANCE_INDEX: vcapApplication['instance_index'],
                        URI: vcapApplication['uris'],
                        START_TIME: vcapApplication['started_at'],
                        APP_PORT: vcapApplication['port']
                    };

                    if (process.env.APM_BM_SECURE_GATEWAY ||
                            process.env.APM_BM_GATEWAY_URL || process.env.MONITORING_SERVER_URL
                        || fs.existsSync(__dirname + '/../etc/global.environment')) {
                        this.app_guid = vcapApplication['application_id'];
                    }
                } else {
                    var the_port = getServerPort();
                    the_port = the_port === 'unknown' ? 0 : the_port;

                    if (!process.env.MONITORING_APPLICATION_NAME) {

                        // find name in package.json
                        if (process.mainModule.paths && process.mainModule.paths.length > 0) {
                            var name = generateAppNameByPackage();

                            if (!name) {
                                logger.warn('Failed to get name in package.json,' +
                                    ' will generate applicationName and' +
                                    ' APP_GUID by file position.');
                                this.generateApplicationNameAndGuidbyPath();
                            } else {
                                this.app_guid = this.app_hostname + '_' + name;
                                this.applicationName = name;
                            }
                        } else {
                            this.generateApplicationNameAndGuidbyPath();
                        }

                    } else {
                        this.app_guid = this.app_hostname + '_' +
                            process.env.MONITORING_APPLICATION_NAME;
                    }
                    this.app_data = {
                        APP_NAME: this.applicationName,
                        INSTANCE_ID: '' + process.pid,
                        INSTANCE_INDEX: 0,
                        URI: [os.hostname() + ':' + the_port],
                        START_TIME: (new Date()).toISOString(),
                        APP_PORT: the_port
                    };
                }
            } else {
                logger.error('JsonSender: VCAP_APPLICATION env variable not found and ' +
                    'there is no global.environment in etc folder');
            }
        }
    } catch (e) {
        logger.error('JsonSender initialization error: ' + e);
        logger.error(e.stack);
    }

};

JsonSender.prototype.generateApplicationNameAndGuidbyPath =
        function generateApplicationNameAndGuidbyPath() {
            var the_path = process.env.PWD;
            var the_folder = the_path.replace(/\//g, '_');
            var arg_str = process.argv[1].replace(/\//g, '_');
            var appGuid = os.hostname() + '_' + the_folder + '_' + arg_str;
            var nodeAppNPMMD5 = crypto.createHash('md5');
            nodeAppNPMMD5.update(appGuid);
            appGuid = nodeAppNPMMD5.digest('hex');
            this.app_guid = appGuid.substring(0, Math.min(25, appGuid.length));

            if (process.argv[1].indexOf(the_path) !== -1)
                this.applicationName = this.applicationName || process.argv[1];
            else
                this.applicationName = this.applicationName || the_path + '/' + process.argv[1];
        };

function generateAppNameByPackage() {
    var name;
    for (var i in process.mainModule.paths) {
        var packageFile = process.mainModule.paths[i].split('node_modules')[0] +
            '/' + 'package.json';
        try {
            var packageString = fs.readFileSync(packageFile);
            var packageJson = JSON.parse(packageString);
            if (packageJson.name) {
                name = packageJson.name;
                break;
            }
        } catch (e) {
            logger.info('Failed to get ' + packageFile);
        }
    }
    return name;
}

JsonSender.prototype.registerExternalDependencies = function registerExternalDependencies() {
    var credential_exclude_keys = ['password', 'secret', 'key'];
    if (!process.env.VCAP_SERVICES) {
        return;
    }
    try {
        var services = JSON.parse(process.env.VCAP_SERVICES);
        for (var s_key in services) {
            var service = services[s_key];
            for (var i in service) {
                var service_inst = service[i];
                this.externalRegister[s_key + '_' + i] = {};
                this.externalRegister[s_key + '_' + i].string = service_inst.name;
                var externalMD5 = crypto.createHash('md5');
                externalMD5.update(this.externalRegister[s_key + '_' + i].string);
                this.externalRegister[s_key + '_' + i].MD5 = externalMD5.digest('hex');
                this.externalRegister[s_key + '_' + i].info = service_inst;
                var external_obj = {
                    id: this.externalRegister[s_key + '_' + i].MD5,
                    type: service_inst.tags ? service_inst.tags : ['external'],
                    startTime: this.startTime,
                    displayLabel: service_inst.name,
                    properties: {
                        name: service_inst.label,
                        displayName: service_inst.name
                    },
                    references: [
                        { direction: 'from', type: 'uses', id: this.nodeAppMD5String }
                    ]
                };

                for (var k in service_inst) {
                    if (k !== 'label' && k !== 'name' && k !== 'tags') {
                        if (typeof service_inst[k] === 'string') {
                            external_obj.properties[k] = service_inst[k];
                        } else if (k === 'credentials') {
                            var credentials = service_inst[k];
                            for (var c_key in credentials) {
                                if (c_key.indexOf('url') >= 0) {
                                    external_obj.properties[c_key]
                                        = credentials[c_key];
                                    externalMD5 = crypto.createHash('md5');
                                    externalMD5.update(credentials[c_key]);
                                    var urlMD5 = externalMD5.digest('hex');
                                    this.externalRegister[s_key + '_' + i].MD5 = urlMD5;
                                    external_obj.id = urlMD5;

                                } else if (credential_exclude_keys.indexOf(c_key) < 0) {
                                    external_obj.properties['credentials.' + c_key]
                                        = credentials[c_key];
                                }
                            }
                        }
                    }
                }

                restClient.registerResource(external_obj);

            }

        }
    } catch (e) {
        logger.error('JsonSender register external dependencies error: ' + e);
        logger.error(e.stack);
    }

};

JsonSender.prototype.registerAppModel = function registerAppModel() {
    if (this.vcap) {
        var uri = this.vcap.application_uris[0];
        var interfaceMD5 = crypto.createHash('MD5');
        interfaceMD5.update(uri);
        var interfaceMD5String = interfaceMD5.digest('hex');
        var interfaceObj = {
            id: interfaceMD5String,
            type: ['interface'],
            startTime: this.startTime,
            displayLabel: uri,
            properties: {
                uri: uri,
                name: uri
            },
            references: [
                { direction: 'from', type: 'has', id: this.nodeAppMD5String }
            ]
        };
        restClient.registerResource(interfaceObj);


        var instanceMD5 = crypto.createHash('MD5');
        instanceMD5.update(this.vcap.instance_id);
        var instanceMD5String = instanceMD5.digest('hex');
        var instanceObj = {
            id: instanceMD5String,
            type: ['applicationInstance'],
            startTime: this.startTime,
            displayLabel: this.applicationName + ':' + this.vcap.instance_index,
            properties: {
                name: this.applicationName + ':' + this.vcap.instance_index,
                instance_index: this.vcap.instance_index,
                instance_id: this.vcap.instance_id
            },
            references: [
                { direction: 'to', type: 'runsOn', id: this.nodeEngineMD5String },
                { direction: 'to', type: 'realizes', id: this.nodeAppMD5String },
                { direction: 'to', type: 'implements', id: interfaceMD5String }
            ]
        };
        restClient.registerResource(instanceObj);
    }
};

JsonSender.prototype.dynamicRegister = function dynamicRegister(env) {
    if (this.cloudnative) {
        if (/* getServerPort() != 'unknown' && */ !this.registeredAll) {
            var osEnvItems = {};
            var appEnvItems = {};
            var engineEnvItems = {};

            for (var entry in env) {
                if (entry.substring(0, 3) === 'os.')
                    osEnvItems[entry] = env[entry];
                else if (entry === 'runtime.version' ||
                    entry === 'runtime.name' ||
                    entry === 'agentcore.version' ||
                    entry === 'heap.size.limit' ||
                    entry === 'max.old.space.size' ||
                    entry === 'max.heap.size' ||
                    entry === 'max.semi.space.size') {
                    engineEnvItems[entry] = env[entry];
                } else {
                    appEnvItems[entry] = env[entry];
                }
            }

            // Register OS:
            var hostnameMD5 = crypto.createHash('md5');
            hostnameMD5.update(this.app_hostname);
            this.osMD5 = hostnameMD5.digest('hex');
            var osObj = {
                id: this.osMD5,
                type: ['compute'],
                startTime: this.startTime,
                displayLabel: this.app_hostname,
                properties: commonTools.merge([{
                    version: 'os version',
                    displayName: process.platform + '-' + this.app_hostname,
                    name: this.app_hostname
                }, osEnvItems])
            };
            restClient.registerResource(osObj);

            // Register node.js engine:
            var nodeEngineMD5 = crypto.createHash('md5');
            nodeEngineMD5.update(this.nodeEngineString);
            this.nodeEngineMD5String = nodeEngineMD5.digest('hex');
            var nodeEngineObj = {
                id: this.nodeEngineMD5String,
                type: ['nodeengine'],
                startTime: this.startTime,
                displayLabel: 'Node.js Engine',
                properties: commonTools.merge([{
                    version: process.versions.node,
                    http_parser: process.versions.http_parser,
                    v8: process.versions.v8,
                    ares: process.versions.ares,
                    uv: process.versions.uv,
                    zlib: process.versions.zlib,
                    modules: process.versions.modules,
                    openssl: process.versions.openssl,
                    displayName: 'Node.js Engine', // TODO, must unique?
                    name: 'Node.js Engine',
                    pid: process.pid
                }, engineEnvItems]),
                references: [
                    { direction: 'to', type: 'runsOn', id: this.osMD5 }
                ]

            };
            restClient.registerResource(nodeEngineObj);

            var nodeappPayload = {
                id: this.nodeAppMD5String,
                type: ['NodeJsApplication', 'application'],
                startTime: this.startTime,
                displayLabel: 'Node.js App: ' + this.applicationName, // TODO, must unique?
                properties: commonTools.merge([{
                    version: process.versions.node,
                    displayName: this.applicationName, // TODO, must unique?
                    name: this.applicationName,
                    pid: process.pid,
                    port: getServerPort(),
                    type: getDeploymentType(),
                    path: process.mainModule ? process.mainModule.filename : process.argv[1]
                }, appEnvItems]),
                references: [
                    { direction: 'to', type: 'dependsOn', id: this.nodeAppNPMMD5String },
                    { direction: 'from', type: 'manages',
                        id: this.dcMD5String, nodetype: 'provider' }
                ]
            };
            if (this.vcap) {
                nodeappPayload.properties = commonTools.merge([nodeappPayload.properties,
                    this.vcap]);
                nodeappPayload.properties.instance_index = undefined;
                nodeappPayload.properties.instance_id = undefined;

            }
            restClient.registerResource(nodeappPayload);

            this.registerAppModel();
            this.registerExternalDependencies();
            this.registeredAll = true;
        }
    }
};

JsonSender.prototype.setEnvironment = function setEnvironment(env) {
    this.isAppMetricInitialized = true;
    this.environment = env;
};

function convertTypes(key, value) {
    if (key === 'REQRATE') {
        return value ? value * 1000 / 60 >>> 0 : value;
    }
    if (key === 'CPU_P') {
        return value ? value * 1000 >>> 0 : value;
    }
    if (key === 'app_uptime') {
        value = value / 1000;
        return (value / (24 * 60 * 60) >>> 0) + 'd ' +
            (value % (24 * 60 * 60) / (60 * 60) >>> 0) + 'h ' +
            (value % (60 * 60) / 60 >>> 0) + 'm ' + (value % 60 >>> 0) + 's';
    }
    return value;
};

JsonSender.prototype.send = function send(data) {
    // format: data = {appInfo:{}, appInfo2:{}, httpReq:[], GC:{}, El;{}, profiling:{},profMeta:{}}

    if (data == null || data.appInfo == null) {
        return;
    }
    if (this.isAppMetricInitialized) {
        this.dynamicRegister(this.environment);
    }

    // Send monitoring data to BAM
    if (this.cloudnative) {

        var appInfoPayload = {
            resourceID: this.nodeAppMD5String,
            dimensions: {
                name: 'app_info'
            },
            metrics: commonTools.merge([{
                REQRATE: data.appInfo.REQRATE,
                RESP_TIME: data.appInfo.RESP_TIME,
                MAX_RSPTIME: data.appInfo.MAX_RSPTIME
            }, data.appInfo2])
        };
        restClient.sendMetrics(appInfoPayload);

        var computeInfoPayload = {
            resourceID: this.osMD5,
            dimensions: {
                name: 'compute_info'
            },
            metrics: {
                os_sysCpuPercentage: data.computeInfo.os_sysCpuPercentage,
                os_sysMemAll: data.computeInfo.os_sysMemAll,
                os_sysMemUsed: data.computeInfo.os_sysMemUsed,
                os_sysMemFree: data.computeInfo.os_sysMemFree
            }
        };
        restClient.sendMetrics(computeInfoPayload);

        if (this.nodeEngineMD5String) {
            var enginePayloadMeta = {
                resourceID: this.nodeEngineMD5String,
                dimensions: {
                    name: 'engineStats'
                }
            };
            var enginePayload = [
                commonTools.merge([
                    enginePayloadMeta, {
                        timestamp: new Date().toISOString(),
                        metrics: {
                            CPU_P: data.appInfo.CPU_P,
                            MEM_RSS: data.appInfo.MEM_RSS,
                            app_memAll: data.appInfo.app_memAll,
                            UPTIME: data.appInfo.UPTIME
                        }
                    }
                ])
            ];
            // Event loop and GC have multiple event in one minute

            for (var i in data.GC_Arr) {
                enginePayload.push(commonTools.merge([
                    enginePayloadMeta, {
                        timestamp: new Date(data.GC_Arr[i].gc_timestamp).toISOString(),
                        metrics: {
                            gc_duration: data.GC_Arr[i].gc_duration,
                            gc_type: data.GC_Arr[i].gc_type,
                            gc_heapUsed: data.GC_Arr[i].gc_heapUsed,
                            gc_heapSize: data.GC_Arr[i].gc_heapSize
                        }
                    }]));
            }
            for (var j in data.EL_Arr) {
                enginePayload.push(commonTools.merge([
                    enginePayloadMeta, {
                        timestamp: new Date(data.EL_Arr[j].eventloop_timestamp).toISOString(),
                        metrics: {
                            eventloop_latencyAvg: data.EL_Arr[j].eventloop_latencyAvg,
                            eventloop_latencyMin: data.EL_Arr[j].eventloop_latencyMin,
                            eventloop_latencyMax: data.EL_Arr[j].eventloop_latencyMax
                        }
                    }]));
            }
            for (var k in data.Loop_Arr) {
                enginePayload.push(commonTools.merge([
                    enginePayloadMeta, {
                        timestamp: new Date(data.Loop_Arr[k].loop_timestamp).toISOString(),
                        metrics: {
                            loop_average: data.Loop_Arr[k].loop_average,
                            loop_maximum: data.Loop_Arr[k].loop_maximum,
                            loop_minimum: data.Loop_Arr[k].loop_minimum,
                            loop_count: data.Loop_Arr[k].loop_count
                        }
                    }]));
            }

            restClient.sendMetricsBatched(enginePayload);
        }

        if (data.prof.length > 0) {
            this.sendMethodProfiling(data.prof, data.profMeta);
        }

        return;
    }
    // Send monitoring data to M&A or Saas/onPremise (Saas/onPremise not done)
    if (this.mAndA) {
        var initData = {
            SUBNODE_TYPE: 'BNJ',
            APP_GUID: this.app_guid
        };
        var reqData = {
            HTTP_REQ: data.httpReq
        };

        if (data.appInfo.PORT === 'unknown' || data.appInfo.PORT == null) {
            data.appInfo.PORT = this.app_data.APP_PORT;
        } else {
            try {
                data.appInfo.PORT = parseInt(data.appInfo.PORT);
            } catch (e) {
                data.appInfo.PORT = 0;
            }
        }

        var merge_data = commonTools.merge([initData, this.app_data, data.appInfo,
            data.GC, data.El, reqData]);

        var post_data = JSON.stringify(merge_data, convertTypes);
        logger.debug('JsonSender POST data: ' + post_data);

        var headers = {
            'Content-Type': 'application/json',
            'Content-Length': post_data.length
        };
        // Send to M&A server
        if (!(process.env.DISABLE_MA_APM_SERVER === 'true') && this.MA_info.hostname) {
            var MA_options = {
                hostname: this.MA_info.hostname,
                host: this.MA_info.host,
                port: this.MA_info.port,
                path: this.MA_info.path,
                method: 'POST',
                agent: false,
                // rejectUnauthorized: false,
                headers: headers
            };
            if (!this.MA_info.isHttp) {
                MA_options['pfx'] = this.MA_info.keyp12;
                MA_options['passphrase'] = this.MA_info.password;
                MA_options['rejectUnauthorized'] = false;
            }
            senderTool.proxy_it(MA_options, this.MA_info.isHttp);

            senderTool.data_sender(MA_options, this.MA_info.isHttp, post_data);
        }

        // Send to APM_BM_Gateway
        if (process.env.APM_BM_SECURE_GATEWAY ||
                ((process.env.APM_BM_GATEWAY_URL || process.env.MONITORING_SERVER_URL)
                        && (senderTool.BM_info.done))) {
            var BM_info = senderTool.BM_info;
            var urlMap = url.parse(BM_info.resource_url);
            var isHttp = urlMap.protocol === 'http:';
            var BM_options = {
                hostname: urlMap['hostname'],
                host: urlMap['host'],
                port: urlMap['port'] ? urlMap['port'] : BM_info.port,
                path: urlMap['path'],
                pfx: BM_info.pfx,
                passphrase: BM_info.passphrase,
                cer: BM_info.cert,
                key: BM_info.key,
                method: 'POST',
                agent: false,
                headers: headers
            };
            if ((process.env.APM_BM_GATEWAY_URL || process.env.MONITORING_SERVER_URL) && !isHttp) {
                BM_options.servername = process.env.MONITORING_SERVER_NAME ?
                    process.env.MONITORING_SERVER_NAME : process.env.APM_SNI ?
                    process.env.APM_SNI : 'default.server';
                // BM_options.secureProtocol = 'TLSv1_2_client_method';
            }
            senderTool.proxy_it(BM_options, isHttp);
            senderTool.data_sender(BM_options, isHttp, post_data);

            // pickup bmapp_id for hybrid
            if (!process.env.HYBRID_BMAPPID || process.env.HYBRID_BMAPPID === 'undefined') {
                // not getMSN yet, or the first time, returned MSN is 'undefined'
                BM_options.method = 'GET';
                BM_options.headers = undefined;
                if (process.env.APM_GW_PROXY_CONNECTION && isHttp) {
                    BM_options.path = '/OEReceiver/getMSNs/' + this.app_guid;
                } else {
                    BM_options.path = '/OEReceiver/getMSNs/' + this.app_guid;
                }
                if ((process.env.APM_BM_GATEWAY_URL || process.env.MONITORING_SERVER_URL)
                        && !isHttp) {
                    BM_options.servername = process.env.MONITORING_SERVER_NAME ?
                        process.env.MONITORING_SERVER_NAME : process.env.APM_SNI ?
                        process.env.APM_SNI : 'default.server';
                    // BM_options.secureProtocol = 'TLSv1_2_client_method';
                }

                if (process.env.APM_GW_PROXY_CONNECTION && isHttp && senderTool.httpProxy) {
                    try {
                        senderTool.httpProxy.get('http://' + BM_options.hostname + ':'
                            + BM_options.port + BM_options.path, function(err, resp, body) {
                            if (err) {
                                logger.error(err);
                            }
                            if (body) {
                                try {
                                    process.env.HYBRID_BMAPPID =
                                        JSON.parse(body.toString())['MSNs'][0];
                                    logger.info('hybrid_bmappid', process.env.HYBRID_BMAPPID);

                                } catch (e) {
                                    logger.error('getMSNs cannot be convert to json');
                                }
                            }
                        });
                        return;
                    } catch (e) {
                        logger.log('error', e.message);
                        logger.log('error', e.stack);
                    }
                }
                var sendMethod = isHttp ? http : https;
                // console.info('getting bmapp_id:',BM_options.hostname,BM_options.path,isHttp);
                var req = sendMethod.request(BM_options, function(res) {
                    res.on('data', function(d) {
                        try {
                            process.env.HYBRID_BMAPPID = JSON.parse(d.toString())['MSNs'][0];
                            console.info('hybrid_bmappid', process.env.HYBRID_BMAPPID);
                        } catch (e) {
                            logger.log('error', 'getMSNs cannot be convert to json');
                        }
                    });

                });
                req.end();
                req.on('error', function(e) {
                    logger.log('error', 'Failed to get bmapp_id from OEReceiver.' + e);
                });
            }
        }
    }
};

JsonSender.prototype.getDataType = function getDataType() {
    return 'json';
};

JsonSender.prototype.sendAAR = function(req_inst) {
    if (!(commonTools.testTrue(process.env.KNJ_ENABLE_TT)) &&
        process.env.KNJ_ENVTYPE === 'Cloudnative') {
        // send AAR from http request at resource level
        var interaction_info = {};
        if (req_inst.header && req_inst.requestHeader) {
            interaction_info =
                aarTools.extractInfoFromHeader(req_inst.header, req_inst.requestHeader);
        }
        interaction_info.method = req_inst.method;
        interaction_info.appName = req_inst.url;
        interaction_info.url = interaction_info.fullurl ||
            commonTools.getFullURL(req_inst.url, this.IP, getServerPort(),
                interaction_info.protocol);

        var payload_json = {
            metrics: {
                status: req_inst.statusCode < 400 ? 'Good' : 'Failed',
                responseTime: req_inst.duration / 1000
            },
            properties: {
                // threadID: '0',
                documentType: '/AAR/Middleware/NODEJS',
                softwareServerType: 'http://open-services.net/ns/crtv#NodeJS',
                softwareModuleName: this.applicationName,
                resourceID: this.nodeAppMD5String,
                processID: process.pid,
                diagnosticsEnabled: commonTools.testTrue(process.env.KNJ_ENABLE_DEEPDIVE),
                applicationName: this.applicationName,
                serverName: this.app_hostname,
                serverAddress: this.IP,
                requestName: req_inst.url,
                componentName: 'Bluemix Node.JS Application',
                transactionName: req_inst.url,
                documentVersion: '2.0', // why?
                startTime: (new Date(req_inst.time)).toISOString(),
                finishTime: (new Date(req_inst.time + req_inst.duration)).toISOString(),
                documentID: uuid.v1()
            },
            interactions: []
        };
        if (process.env.HYBRID_BMAPPID && process.env.HYBRID_BMAPPID !== 'undefined') {
            payload_json.properties.originID = process.env.HYBRID_BMAPPID;
        }
        restClient.sendAAR(payload_json, function(err) {
            if (err) {
                logger.error(err.message);
            }
        });
    }

};

JsonSender.prototype.sendAARTT = function(data) {
    var payload_json = aarTools.composeAARTT(data, getServerPort());

    if (process.env.KNJ_ENVTYPE === 'Cloudnative') {
        restClient.sendAAR(payload_json, function(err) {
            if (err) {
                logger.error(err.message);
            }
        });
    } else {
        if (this.aarBatchForBI.payload.length === 0){
            this.aarBatchForBI.committed = false;
            var aarBatchForBI = this.aarBatchForBI;
            setTimeout(function(){
                if (aarBatchForBI.payload.length > 0) {
                    sendAARToBI(aarBatchForBI.payload);
                }
                aarBatchForBI.committed = true;
                aarBatchForBI.payload = [];
            },
            global.KNJ_AAR_BATCH_FREQ * 1000);
        }


        if (!this.aarBatchForBI.committed){
            this.aarBatchForBI.payload.push(payload_json);
        }

        if (this.aarBatchForBI.payload.length >= global.KNJ_AAR_BATCH_COUNT){
            sendAARToBI(this.aarBatchForBI.payload);
            this.aarBatchForBI.committed = true;
            this.aarBatchForBI.payload = [];
        }

    }
};

function sendAARToBI(json_payload){
    if (process.env.HYBRID_BMAPPID && process.env.HYBRID_BMAPPID !== 'undefined') {

        var post_data = JSON.stringify(json_payload);
        var headers = {
            'Content-Type': 'application/json',
            'Content-Length': post_data.length
        };

        var BM_info = senderTool.BM_info;
        var urlMap = url.parse(BM_info.deepdive_url);
        var isHttp = urlMap.protocol === 'http:';
        var BM_options = {
            hostname: urlMap['hostname'],
            host: urlMap['host'],
            port: urlMap['port'] ? urlMap['port'] : BM_info.port,
            path: urlMap['path'] + '?tenant=34&origin='
                        + process.env.HYBRID_BMAPPID + '&type=aar/middleware',
            pfx: BM_info.pfx,
            passphrase: BM_info.passphrase,
            cer: BM_info.cert,
            key: BM_info.key,
            method: 'POST',
            agent: false,
            headers: headers
        };
        if ((process.env.APM_BM_GATEWAY_URL || process.env.MONITORING_SERVER_URL) && !isHttp) {
            BM_options.servername = process.env.MONITORING_SERVER_NAME ?
                    process.env.MONITORING_SERVER_NAME : process.env.APM_SNI ?
                    process.env.APM_SNI : 'default.server';
                // BM_options.secureProtocol = 'TLSv1_2_client_method';
        }
        senderTool.proxy_it(BM_options, isHttp);
        senderTool.data_sender(BM_options, isHttp, post_data);
    }
};


JsonSender.prototype.sendADR = function(data) {
    var payload_json = {
        properties: {
            startTime: data.time,
            finishTime: Math.floor(data.time + data.duration),
            documentType: 'ADR/Middleware/NODEJS',
            contentType: 'methodTrace',
            documentID: uuid.v1(),
            reqType: data.type.toUpperCase(),
            methodEntries: commonTools.testTrue(process.env.KNJ_ENABLE_METHODTRACE) ?
                'true' : 'false',
            reqName: data.name
        },
        statistics: {
            summary: {
                responseTime: data.duration / 1000
            }
        }
    };

    payload_json.statistics.traceData = adrTools.composeTraceData([], data.request, 1);

    restClient.sendADR(payload_json, function(err) {
        if (err) {
            logger.error(err.message);
        }
    });
};

JsonSender.prototype.sendMethodProfiling = function(data, meta) {
    var payload_json = {
        properties: {
            startTime: meta.startTime,
            finishTime: meta.finishTime,
            documentType: 'ADR/Middleware/NODEJS',
            contentType: 'methodProfiling',
            documentID: uuid.v1()
        },
        statistics: {
            summary: {
            }
        }
    };
    // var count = 0;
    var traceData = [];
    for (var i in data) {
        // count += data[i].COUNT;
        traceData.push({
            count: data[i].profiling_count,
            name: data[i].profiling_name,
            line: data[i].profiling_line,
            file: data[i].profiling_file
        });
    }
    payload_json.statistics.summary.profilingSampleCount = meta.count;
    payload_json.statistics.traceData = traceData;
    restClient.sendADR(payload_json, function(err) {
        if (err) {
            logger.error(err.message);
        }
    });
};
exports.jsonSender = new JsonSender();
