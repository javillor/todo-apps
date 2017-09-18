// Copyright IBM Corp. 2017. All Rights Reserved.
// Node module: ibmapm
// This file is licensed under the Apache License 2.0.
// License text available at https://opensource.org/licenses/Apache-2.0

var http = require('http');
var https = require('https');
var url = require('url');
var fs = require('fs');
var HttpsProxyAgent = require('./https-proxy-agent');
var request = require('request');
var properties = require('properties');

var log4js = require('log4js');

if (!process.env.KNJ_LOG_TO_FILE) {
    log4js.loadAppender('console');
} else {
    log4js.loadAppender('file');
    log4js.addAppender(log4js.appenders.file('nodejs_sender.log'), 'knj_sender_log');
}

var logger = log4js.getLogger('knj_sender_log');
var loglevel = process.env.KNJ_LOG_LEVEL ? process.env.KNJ_LOG_LEVEL.toUpperCase() : undefined;
if (loglevel &&
    (loglevel === 'OFF' || loglevel === 'ERROR' || loglevel === 'INFO'
        || loglevel === 'DEBUG' || loglevel === 'ALL')) {
    logger.setLevel(loglevel);
} else {
    logger.setLevel('INFO');
}
exports.proxyAgent = false;
exports.httpProxy = undefined;

exports.BM_info = {
};

exports.data_sender = function(options, isHttp, data) {
    logger.debug('sending', options.host, options.port, options.path,
        options.method, JSON.stringify(options.headers));
    logger.debug('data', data);

    if (!isHttp) {
        options.agent = exports.proxyAgent;
    }
    var sendmethod = (isHttp ? http : https);
    options.rejectUnauthorized = false;
    if (isHttp && exports.httpProxy) {
        var theProxy = exports.httpProxy;
        try {
            theProxy.post('http://' + options.hostname + ':' + options.port + options.path, {
                body: data, // JSON.stringify(data),
                headers: options.headers
            }, function(err, resp, body) {
                if (err) {
                    logger.error(err);
                }
                if (resp) {
                    logger.info('tool/sender.data_sender through proxy response statusCode: ' +
                        resp.statusCode);
                }
            });
        } catch (e) {
            logger.error(e.message);
            logger.error(e.stack);
        }
    } else {
        try {
            var req = sendmethod.request(options, function(res) {
                logger.info('tool/sender.data_sender response statusCode: ' + res.statusCode);
                res.setEncoding('utf8');
                res.on('data', function(d) {
                    logger.debug('tool/sender.data_sender response: ' + d.toString());
                });

                res.on('error', function(error) {
                    logger.error('tool/sender.data_sender response error: ' + error);
                });
            });

            req.on('error', function(error) {
                logger.error('tool/sender.data_sender request error: ' + error);
            });

            req.write(data);
            req.end();
        } catch (e) {
            logger.error(e.message);
            logger.error(e.stack);
        }
    }
};

exports.proxy_it = function(options, isHttp) {
    if (process.env.APM_GW_PROXY_CONNECTION) {
        if (isHttp) {
            logger.info('get proxy for http request');
            exports.httpProxy = request.defaults({proxy: process.env.APM_GW_PROXY_CONNECTION});
        } else if (!exports.proxyAgent) {
            logger.info('get proxy for https request');
            exports.proxyAgent = new HttpsProxyAgent(process.env.APM_GW_PROXY_CONNECTION);
            options.agent = exports.proxyAgent;
        }
    }
};

exports.BM_info_generator = function() {
    var urlbase = '';
    var global_obj;
    var global_string;
    var option;
    if (exports.BM_info.done) {
        return exports.BM_info;
    }

    // get target server URL
    if (process.env.APM_BM_SECURE_GATEWAY) {
        urlbase = 'https://' + process.env.APM_BM_SECURE_GATEWAY;
        exports.BM_info.done = true;
        exports.BM_info.port = 443;
    } else if (process.env.MONITORING_SERVER_URL || process.env.APM_BM_GATEWAY_URL) {
        urlbase = process.env.MONITORING_SERVER_URL || process.env.APM_BM_GATEWAY_URL;
        option = url.parse(urlbase);
        if (option.protocol === 'http:') {
            exports.BM_info.done = true;
            exports.BM_info.port = 80;
        } else {
            exports.BM_info.port = 443;
        }
    } else {
        try {
            global_string = fs.readFileSync(__dirname + '/../../etc/global.environment');

            global_obj = properties.parse(global_string.toString(),
                {
                    separators: '=',
                    comments: [';', '@', '#']
                });
            if (global_obj.APM_BM_GATEWAY_URL) {
                urlbase = global_obj.APM_BM_GATEWAY_URL;
                urlbase = urlbase.trim();
                process.env.APM_BM_GATEWAY_URL = urlbase;
                if (global_obj.APM_SNI) {
                    process.env.APM_SNI = global_obj.APM_SNI;
                }
                option = url.parse(urlbase);
                if (option.protocol === 'http:') {
                    exports.BM_info.done = true;
                    exports.BM_info.port = 80;
                } else {
                    exports.BM_info.port = 443;
                }
            }
        } catch (e) {
            logger.error('Cannot get target server url either from etc/global.environment,' +
                ' etc/config.properties or from environment variables.');
        }
    }
    exports.BM_info.resource_url = urlbase + '/OEReceiver/v1/monitoringdata';
    exports.BM_info.deepdive_url = urlbase + '/1.0/monitoring/data';
    // get target server URL done
    // get credential
    if (!exports.BM_info.done) {
        if (process.env.APM_KEYFILE) {
            exports.BM_info.pfx = new Buffer(process.env.APM_KEYFILE, 'base64');
            exports.BM_info.passphrase =
                (new Buffer(process.env.APM_KEYFILE_PSWD, 'base64')).toString();
            exports.BM_info.done = true;
        } else if (process.env.APM_KEYFILE_URL) {
            try {
                global_string = fs.readFileSync(__dirname + '/../../etc/global.environment');

                global_obj = properties.parse(global_string.toString(),
                    {
                        separators: '=',
                        comments: [';', '@', '#']
                    });
                if (!process.env.APM_KEYFILE_PSWD) {
                    if (global_obj.APM_KEYFILE_PSWD) {
                        process.env.APM_KEYFILE_PSWD = global_obj.APM_KEYFILE_PSWD;
                    } else {
                        logger.info('Cannot get APM_KEYFILE_PSWD either from ' +
                            'etc/global.environment or from environment variables, ' +
                            'use default value.');
                        process.env.APM_KEYFILE_PSWD = (new Buffer('ccmR0cKs!')).toString('base64');
                    }
                }
            } catch (e) {
                logger.info('Cannot get APM_KEYFILE_PSWD either from etc/global.environment ' +
                    'or from environment variables, use default value.');
                process.env.APM_KEYFILE_PSWD = (new Buffer('ccmR0cKs!')).toString('base64');
            }

            exports.BM_info.passphrase =
                (new Buffer(process.env.APM_KEYFILE_PSWD, 'base64')).toString();
            var info = exports.BM_info;
            var keyfile_options = url.parse(process.env.APM_KEYFILE_URL);
            var sendmethod = (keyfile_options.protocol === 'http:' ? http : https);

            var req = sendmethod.request(keyfile_options, function(res) {
                res.on('data', function(d) {
                    if (!info.pfx) {
                        info.pfx = d;
                    } else {
                        info.pfx = Buffer.concat([info.pfx, d], info.pfx.length + d.length);
                    }
                    info.done = true;
                });

                res.on('error', function(error) {
                    logger.error('JsonSender response error: ' + error);
                });
            });
            req.on('error', function(error) {
                logger.error('JsonSender request error: ' + error);
            });
            req.end();
        } else {
            try {
                var buff;
                var tmp_pass;
                if (!global_obj) {
                    try {
                        global_string = fs.readFileSync(__dirname +
                            '/../../etc/global.environment');
                        global_obj = properties.parse(global_string.toString(),
                            {
                                separators: '=',
                                comments: [';', '@', '#']
                            });
                    } catch (e) {
                        logger.error('failed to read etc/global.environment');
                        buff = fs.readFileSync(__dirname + '/../key.pkcs12');
                        exports.BM_info.pfx = buff;
                        tmp_pass = process.env.APM_KEYFILE_PSWD ?
                            process.env.APM_KEYFILE_PSWD :
                                (new Buffer('ccmR0cKs!')).toString('base64');
                        exports.BM_info.passphrase = (new Buffer(tmp_pass, 'base64')).toString();
                        exports.BM_info.done = true;
                    }
                }
                if (global_obj) {
                    if (global_obj.APM_KEYFILE_PSWD) {
                        tmp_pass = process.env.APM_KEYFILE_PSWD || global_obj.APM_KEYFILE_PSWD;
                        exports.BM_info.passphrase = (new Buffer(tmp_pass, 'base64')).toString();
                    } else {
                        tmp_pass = process.env.APM_KEYFILE_PSWD
                            || (new Buffer('ccmR0cKs!')).toString('base64');
                        exports.BM_info.passphrase = (new Buffer(tmp_pass, 'base64')).toString();
                    }

                    if (global_obj.APM_KEYFILE) {
                        buff = fs.readFileSync(__dirname + '/../../etc/' + global_obj.APM_KEYFILE);
                        exports.BM_info.pfx = buff;
                        exports.BM_info.passphrase = exports.BM_info.passphrase || 'ccmR0cKs!';
                        exports.BM_info.done = true;
                    } else {
                        buff = fs.readFileSync(__dirname + '/../../etc/keyfile.p12');
                        exports.BM_info.pfx = buff;
                        exports.BM_info.passphrase = exports.BM_info.passphrase || 'ccmR0cKs!';
                        exports.BM_info.done = true;
                    }
                }
            } catch (e) {
                logger.error('Failed to get keyfile, no data will be sent until keyfile is find.');
                logger.info(e);
            }
        }
    }
    // get credential done
};
