// Copyright IBM Corp. 2017. All Rights Reserved.
// Node module: ibmapm
// This file is licensed under the Apache License 2.0.
// License text available at https://opensource.org/licenses/Apache-2.0

var fs = require('fs');
var senderQueue = require('./sender-queue');
var log4js = require('log4js');
var url = require('url');
var cryptoutil = require('./cryptoutil');
var https = require('https');
var http = require('http');
if (!process.env.KNJ_LOG_TO_FILE) {
    log4js.loadAppender('console');
} else {
    log4js.loadAppender('file');
    log4js.addAppender(log4js.appenders.file('nodejs_restclient.log'), 'knj_restclient_log');
}

var logger = log4js.getLogger('knj_restclient_log');
var loglevel = process.env.KNJ_LOG_LEVEL ? process.env.KNJ_LOG_LEVEL.toUpperCase() : undefined;
if (loglevel &&
    (loglevel === 'OFF' || loglevel === 'ERROR' || loglevel === 'INFO' ||
        loglevel === 'DEBUG' || loglevel === 'ALL')) {
    logger.setLevel(loglevel);
} else {
    logger.setLevel('INFO');
}


var queue = senderQueue.getQueue('bam');
var cfg = {
    //    ingressURL : undefined,
    tenantID: '739f4a7e-acae-441b-bd29-c38bfb7cf3f0',
    metrics: 'metric',
    AAR: 'aar/middleware',
    ADR: 'adr/middleware'
};
var SB_PATH = '/1.0/credentials/app/';
var dcId; // string
var AMServiceName = 'AvailabilityMonitoring';
var app_guid;
var resourceEntities = {}; // {<resourceid>:<entityid>, ...}
var relationships = {}; // {<resourceid>:[{type:<linktype>,to:<toresourceid>}], ...}
// var intervalHandlers = {};// {<resourceid>:<interval>, ...}

module.exports.setConfiguration = function(fileName, callback) {
    var tempCfg;
    logger.debug('setConfiguration arg[] ', fileName, callback.name);
    var file = process.env.KNJ_CONFIG_FILE || fileName;
    try {
        var confString = fs.readFileSync(file, 'utf8');
        tempCfg = JSON.parse(confString);
        cfg = tempCfg;
        if (!cfg.metrics) {
            cfg.metrics = 'metric';
        }
        if (!cfg.AAR) {
            cfg.AAR = 'aar/middleware';
        }
        if (!cfg.ADR) {
            cfg.ADR = 'adr/middleware';
        }
        if (cfg.proxy) {
            process.env.KNJ_PROXY = cfg.proxy;
        }
        if (process.env.IBAM_SVC_NAME) {
            logger.debug('IBAM_SVC_NAME is set as: ', process.env.IBAM_SVC_NAME);
            AMServiceName = process.env.IBAM_SVC_NAME;
        }

    } catch (e) {
        logger.error('register_topology set configuration failed.');
    }

    // retrive backend BAM service from AvailabilityMonitoring service
    this.refreshBAMConfig(callback);
    logger.debug('Configuration loaded ', cfg);
    if (callback && !process.env.AM_SERVICE_BOUND) {
        logger.debug('No backend BAM service, call the callback ', callback.name);
        callback();
    }
};

module.exports.refreshBAMConfig = function(callback) {
    logger.debug('Value of  env VCAP_APPLICATION is ', process.env.VCAP_APPLICATION);
    if (process.env.VCAP_APPLICATION) {
        var vcapApplication = JSON.parse(process.env.VCAP_APPLICATION);
        app_guid = vcapApplication['application_id'];
    } else {
        logger.error(' VCAP_APPLICATION env variable not found, faild to connect to AvailabilityMonitoring service.');
    }

    if (process.env.IBAM_INGRESS_URL && process.env.IBAM_TOKEN) {
        logger.debug('Environments IBAM_INGRESS_URL && IBAM_TOKEN are set: ',
            process.env.IBAM_INGRESS_URL, process.env.IBAM_TOKEN);
        cfg.basicauth = true;
        cfg.ingressURL = process.env.IBAM_INGRESS_URL + '/1.0/data';
        cfg.backend_url = process.env.IBAM_INGRESS_URL + '/1.0/data';
        cfg.token = process.env.IBAM_TOKEN;
        return;
    } else {
        logger.debug('Environments IBAM_INGRESS_URL && IBAM_TOKEN are not set.');
    }

    if (process.env.VCAP_SERVICES) {
        // if the AvailabilityMonitoring is bound, then need to send the data to backend
        var vcap_service = JSON.parse(process.env.VCAP_SERVICES);

        if (vcap_service[AMServiceName]) {
            process.env.AM_SERVICE_BOUND = true;
            var cred_url = vcap_service[AMServiceName][0].credentials.cred_url + SB_PATH + app_guid;
            var token = vcap_service[AMServiceName][0].credentials.token;
            cryptoutil.initkey(app_guid);
            token = cryptoutil.unobfuscate(token);
            var urlMap = url.parse(cred_url);
            var amoption = {
                hostname: urlMap['hostname'],
                host: urlMap['host'],
                path: urlMap['path'],
                method: 'GET',
                port: urlMap.port,
                agent: false,
                rejectUnauthorized: false
            };

            if (!urlMap.port) {
                amoption.port = urlMap.protocol === 'https:' ? 443 : 80;
            }

            amoption.headers = {
                Accept: 'application/json',
                'X-TenantId': cfg.tenantID,
                Authorization: 'bamtoken ' + token,
                'User-Agent': 'NodejsDC'
            };
            logger.debug('options to get the backend url: ', amoption);
            var isHttp = urlMap.protocol === 'http:';
            var sendMethod = isHttp ? http : https;
            var req = sendMethod.request(amoption, function(res) {
                logger.debug('statusCode from AvailabilityMonitoring  ', res.statusCode);
                res.on('data', function(d) {
                    try {
                        // init AMConnection
                        var rescontent = JSON.parse(d.toString());
                        logger.debug('response body: ', rescontent);
                        if (rescontent['backend_url'] && rescontent['token']) {
                            cfg.ingressURL = rescontent['backend_url'] + '/1.0/data';
                            cfg.backend_url = rescontent['backend_url'] + '/1.0/data';
                            cfg.token = rescontent['token'];
                            logger.debug('get the backend service: ', cfg);
                            if (callback) {
                                logger.debug(
                                    'The backend BAM service is ready, invoke the callback ',
                                    callback.name);
                                callback();
                            }
                        }

                    } catch (e) {
                        logger.error('faled to parse the backend url', e);
                    }
                });

            });
            req.on('error', function(e) {
                logger.error('Failed to get backend url from AvailabilityMonitoring.', e);
            });
            req.end();

        } else {
            logger.info('No service is bound, with name ', AMServiceName);
        }
    } else {
        logger.info('No any service is bound for this application. ');
    }
};

module.exports.getConfiguration = function() {
    return cfg;
};

module.exports._writeRegistryToFile = function() {
    try {
        var filename = './' + dcId + '.json';
        var fileContent = JSON.stringify({
            resourceEntities: resourceEntities,
            relationships: relationships
        });
        fs.writeFileSync(filename, fileContent, 'utf8');
    } catch (e) {
        logger.error('write registry to file failed');
        logger.error(e);
    }
};

module.exports._readRegistryFromFile = function() {
    try {
        var filename = './' + dcId + '.json';
        var fileContent = fs.readFileSync(filename, 'utf8');
        var jsonContent = JSON.parse(fileContent);
        resourceEntities = jsonContent.resourceEntities;
        relationships = jsonContent.relationships;
        return jsonContent;
    } catch (e) {
        logger.error('read registry to file failed');
        logger.error(e);
    }
};

function genHeaders() {
    var headers = { 'X-TenantID': cfg.tenantID };
    if (cfg.basicauth && cfg.backend_url && cfg.token) {
        headers['Authorization'] = 'Basic ' + cfg.token;
        headers['BM-ApplicationId'] = app_guid;
        headers['User-Agent'] = 'NodejsDC';
    } else if (cfg.backend_url && cfg.token) {
        headers['Authorization'] = 'bamtoken ' + cfg.token;
        headers['BM-ApplicationId'] = app_guid;
        headers['User-Agent'] = 'NodejsDC';
    }
    return headers;
}

module.exports.registerDC = function(obj, callback) {
    var payload = {
        resourceID: obj.id,
        entityTypes: obj.type,
        displayLabel: obj.displayLabel || 'Unknown',
        startedTime: obj.startTime || (new Date()).toISOString(), // '2016-05-27T03:21:25.432Z'
        sourceDomain: process.env.VCAP_APPLICATION ? 'Bluemix' : 'on-prem'
    };
    if (obj.references && obj.references.length > 0) {
        var references = [];
        for (var ref in obj.references) {
            var item = obj.references[ref];
            var ref_item = {
                _edgeType: item.type
            };
            ref_item['_' + item.direction + 'UniqueId'] = item.id;
            references.push(ref_item);
        }
        payload['_references'] = references;
    } else {
        payload['_references'] = [];
    }
    for (var prop in obj.properties) { // merge properties
        payload[prop] = obj.properties[prop];
    }
    dcId = obj.id;
    // TODO add: module.exports._readRegistryFromFile();
    if (!cfg.ingressURL) {
        logger.error('No ingress URL is set, please set "ingressURL" ' +
            'in your configuration json file');
        return;
    }
    queue.addTask({
        url: cfg.ingressURL + '?tenant=' + cfg.tenantID + '&origin=' +
            dcId + '&namespace=&type=providers',
        payload: payload,
        type: 'dc',
        additionalHeader: genHeaders(),
        callback: function(err, result) {
            if (err) {
                logger.error(err);
                if (callback) {
                    callback(err);
                }
                return;
            }
            if (callback) {
                callback(null, result);
            }
        }
    });
};

module.exports.registerResource = function(obj, callback) {
    if (!obj.type || !obj.id || !obj.properties) {
        logger.error('registerResource payload is not complete, must have: ' +
            'id, type and properties');
        return;
    }
    var payload = { // merge public attributes
        uniqueId: obj.id,
        entityTypes: obj.type,
        startedTime: obj.startTime || (new Date()).toISOString(),
        displayLabel: obj.displayLabel || 'Unknown',
        sourceDomain: process.env.VCAP_APPLICATION ? 'Bluemix' : 'on-prem'
    };

    if (obj.references && obj.references.length > 0) {
        var references = [];
        for (var ref in obj.references) {
            var item = obj.references[ref];
            var ref_item = {
                _edgeType: item.type
            };
            ref_item['_' + item.direction + 'UniqueId'] = item.id;
            references.push(ref_item);
        }
        payload['_references'] = references;
    } else {
        payload['_references'] = [];
    }
    for (var prop in obj.properties) { // merge properties
        payload[prop] = obj.properties[prop];
    }
    if (!cfg.ingressURL) {
        logger.error('No ingress URL is set, please set "ingressURL" ' +
            'in your configuration json file');
        return;
    }
    queue.addTask({
        url: cfg.ingressURL + '?tenant=' + cfg.tenantID +
            '&origin=' + dcId + '&namespace=&type=resources',
        payload: payload,
        type: 'resources: ' + payload.entityTypes,
        additionalHeader: genHeaders(),
        callback: function(err, result) {
            if (err) {
                logger.error(err);
                if (callback) {
                    callback(err);
                }
                return;
            }
            if (callback) {
                callback(null, result);
            }
        }
    });
};

module.exports.sendMetrics = function(payload, callback) {
    if (!payload.resourceID || !payload.dimensions || !payload.metrics) {
        logger.warn('sendMetrics payload is not complete, must have: ' +
            'resourceID, dimensions and metrics');
        return;
    }
    if (payload) {
        payload.timestamp = (new Date()).toISOString();
    }
    if (!cfg.ingressURL) {
        logger.error('No ingress URL is set, please set "ingressURL" ' +
            'in your configuration json file');
        return;
    }
    queue.addTask({
        url: cfg.ingressURL + '?type=' + cfg.metrics + '&tenant=' +
            cfg.tenantID + '&origin=' + dcId,
        payload: payload,
        type: 'metrics: ' + payload.dimensions.name,
        additionalHeader: genHeaders(),
        callback: callback
    });
};

module.exports.sendMetricsBatched = function(payload, callback) {

    if (!cfg.ingressURL) {
        logger.error('No ingress URL is set, please set "ingressURL" ' +
            'in your configuration json file');
        return;
    }
    queue.addTask({
        url: cfg.ingressURL + '?type=' + cfg.metrics + '&tenant=' +
            cfg.tenantID + '&origin=' + dcId,
        payload: payload,
        type: 'metrics: batched',
        additionalHeader: genHeaders(),
        callback: callback
    });

};

var aarBatch = {
    payload: [],
    committed: false
};
module.exports.sendAAR = function(payload, callback) {
    if (!payload.properties || !payload.metrics) {
        logger.error('sendAAR payload is not complete, must have: properties and metrics');
        return;
    }
    if (!dcId) {
        callback({ message: 'dcId is not ready' });
    } else {
        payload.properties['originID'] = dcId;
        payload.properties['tenantID'] = cfg.tenantID;
        if (!cfg.ingressURL) {
            logger.error('No ingress URL is set, please set "ingressURL" ' +
                'in your configuration json file');
            return;
        }
        // Meet Patch Condition KNJ_AAR_BATCH_FREQ, then put into task queue
        if (aarBatch.payload.length === 0) {
            aarBatch.committed = false;
            setTimeout(
                function() {
                    if (aarBatch.payload.length > 0) {
                        queue.addTask({
                            url: cfg.ingressURL + '?type=' + cfg.AAR + '&tenant=' +
                                cfg.tenantID + '&origin=' + dcId,
                            payload: aarBatch.payload,
                            type: 'aar: batched',
                            additionalHeader: genHeaders(),
                            callback: callback
                        });
                    }
                    aarBatch.payload = [];
                    aarBatch.committed = true;
                },
                global.KNJ_AAR_BATCH_FREQ * 1000
            );
        }
        if (!aarBatch.committed) {
            aarBatch.payload.push(payload);
        }
        // Meet Patch Condition KNJ_AAR_BATCH_COUNT, then put into task queue
        if (aarBatch.payload.length >= global.KNJ_AAR_BATCH_COUNT) {
            queue.addTask({
                url: cfg.ingressURL + '?type=' + cfg.AAR + '&tenant=' +
                    cfg.tenantID + '&origin=' + dcId,
                payload: aarBatch.payload,
                type: 'aar: batched',
                additionalHeader: genHeaders(),
                callback: callback
            });
            aarBatch.committed = true;
            aarBatch.payload = [];
        }
    }
};

var adrBatch = {
    payload: [],
    committed: false
};
module.exports.sendADR = function(payload, callback) {
    if (!payload.properties || !payload.statistics) {
        logger.error('sendADR payload is not complete, must have: properties and statistics');
        return;
    }
    if (!dcId) {
        callback({ message: 'dcId is not ready' });
    } else {
        payload.properties['originID'] = dcId;
        payload.properties['tenantID'] = cfg.tenantID;
        if (!cfg.ingressURL) {
            logger.error('No ingress URL is set, please set "ingressURL" ' +
                'in your configuration json file');
            return;
        }
        // Meet Patch Condition KNJ_ADR_BATCH_FREQ, then put into task queue
        if (adrBatch.payload.length === 0) {
            adrBatch.committed = false;
            setTimeout(
                function() {
                    if (adrBatch.payload.length > 0) {
                        queue.addTask({
                            url: cfg.ingressURL + '?type=' + cfg.ADR + '&tenant=' +
                                cfg.tenantID + '&origin=' + dcId,
                            payload: adrBatch.payload,
                            type: 'adr: batched',
                            additionalHeader: genHeaders(),
                            callback: callback
                        });
                    }
                    adrBatch.payload = [];
                    adrBatch.committed = true;
                },
                global.KNJ_ADR_BATCH_FREQ * 1000
            );
        }
        if (!adrBatch.committed) {
            adrBatch.payload.push(payload);
        }
        if (adrBatch.payload.length >= global.KNJ_ADR_BATCH_COUNT) {
            queue.addTask({
                url: cfg.ingressURL + '?type=' + cfg.ADR + '&tenant=' +
                    cfg.tenantID + '&origin=' + dcId,
                payload: adrBatch.payload,
                type: 'adr: batched',
                additionalHeader: genHeaders(),
                callback: callback
            });
            adrBatch.payload = [];
            adrBatch.committed = true;
        }
    }
};
