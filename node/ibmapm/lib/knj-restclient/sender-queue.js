// Copyright IBM Corp. 2017. All Rights Reserved.
// Node module: ibmapm
// This file is licensed under the Apache License 2.0.
// License text available at https://opensource.org/licenses/Apache-2.0

var url = require('url');
var http = require('http');
var https = require('https');
var HttpsProxyAgent = require('../tool/https-proxy-agent');
var request = require('request');

var log4js = require('log4js');
var logger = log4js.getLogger('knj_restclient_log');

var httpProxy;
var proxyAgent;

var queues = {};

var INTERVAL = process.env.KNJ_RESTCLIENT_TIMER || 1000;
var MAX_RETRY_TIMES = process.env.KNJ_RESTCLIENT_MAX_RETRY || 3;

function httpSend(task, quequeName, httpurl, payload, type, additionalHeader,
    addtionalOptions, callback) {
    // special for cloudnative register
    if (task.success || task.empty) {
        return;
    }
    logger.debug('send task ', task);
    if (task.retry) {
        logger.info('retring ' + task.retry + ' ...');
    }
    var urlMap = url.parse(httpurl);
    var sendmethod = urlMap.protocol === 'https:' ? https : http;
    var payloadString = (typeof payload === 'object') ? JSON.stringify(payload) : payload;
    var header = {
        'Content-Type': 'application/json',
        'Content-Length': payloadString.length
    };
    var key;
    if (additionalHeader) { // mixin additionalHeader and header
        for (key in additionalHeader) {
            header[key] = additionalHeader[key];
        }
    }
    var options = {
        hostname: urlMap.hostname,
        host: urlMap.host,
        path: urlMap.path,
        method: 'POST',
        agent: false,
        port: urlMap.port,
        rejectUnauthorized: false,
        headers: header
    };
    if (urlMap.auth) {
        if (urlMap.auth.indexOf(':') > 0) {
            options.auth = urlMap.auth;
        } else {
            header['Authorization'] = 'Basic ' + urlMap.auth;
        }
    }
    if (!urlMap.port) {
        options.port = urlMap.protocol === 'https:' ? 443 : 80;
    }

    if (addtionalOptions) {
        for (key in addtionalOptions) {
            options[key] = addtionalOptions[key];
        }
    }

    if (process.env.KNJ_PROXY && urlMap.protocol === 'http:') {
        httpProxy = httpProxy || request.defaults({
            proxy: process.env.KNJ_PROXY,
            rejectUnauthorized: false
        });
        try {
            httpProxy.post('http://' + options.hostname + ':' + options.port + options.path, {
                body: payloadString,
                headers: options.headers
            }, function(err, resp, body) {
                if (err) {
                    logger.error('Request ' + type + ' through proxy, Error:', err);
                }
                if (resp) {
                    logger.info('Request ' + type + ' through proxy, response statusCode: ' +
                        resp.statusCode);
                }
            });
        } catch (e) {
            logger.error('Request ' + type + ' through proxy, Error:', e.message);
            logger.error('Request ' + type + ' through proxy, Error:', e.stack);
        }
    } else {
        if (process.env.KNJ_PROXY && urlMap.protocol === 'https:') {
            if (!proxyAgent) {
                proxyAgent = new HttpsProxyAgent(process.env.KNJ_PROXY);
            }
            options.agent = proxyAgent;
        }
        var req = sendmethod.request(options, function(res) {
            logger.info('Request ' + type + ' response statusCode: ' + res.statusCode);
            if (res.statusCode >= 200 && res.statusCode < 300) {
                task.success = true;
            } else {
                if (task.retry < MAX_RETRY_TIMES) {
                    task.retry++;
                    var i = task.retry;
                    while (i >= 0) {
                        exports.getQueue(quequeName).addTask({ empty: true, type: type });
                        i--;
                    }
                    exports.getQueue(quequeName).addTask(task);
                }
            }
            res.on('data', function(d) {
                logger.info('Request ' + type + ' response: ' + d.toString());
            });
            res.on('error', function(error) {
                logger.error('Request ' + type + ' response error: ' + error);
            });
            if (callback) {
                callback(null, res);
            }
        });
        req.on('error', function(error) {
            if (task.retry < MAX_RETRY_TIMES) {
                task.retry++;
                var i = task.retry;
                while (i >= 0) {
                    exports.getQueue(quequeName).addTask({ empty: true, type: type });
                    i--;
                }
                exports.getQueue(quequeName).addTask(task);
            }
            logger.error('Register ' + type + ' request error:' + error);
            if (callback) {
                callback(error);
            }
        });
        req.write(payloadString);
        req.end();
    }
}

function SenderQueue(name) {
    this.name = name;
    this.dcQueue = [];
    this.resourceQueue = [];
    this.metricQueue = [];
    this.aaradrQueue = [];
    this.other = [];
}

SenderQueue.prototype.addTask = function(task) {
    if (task.type === 'dc') {
        this.dcQueue.push(task);
    } else if (task.type && task.type.indexOf('resources:') === 0) {
        this.resourceQueue.push(task);
    } else if (task.type && task.type.indexOf('metrics:') === 0) {
        this.metricQueue.push(task);
    } else if (task.type && task.type.indexOf('aar:') === 0) {
        this.aaradrQueue.push(task);
    } else if (task.type && task.type.indexOf('adr:') === 0) {
        this.aaradrQueue.push(task);
    } else {
        this.other.push(task);
    }
};

SenderQueue.prototype.consume = function() {
    // sequence: dc -> resource -> metric -> aar/adr
    var task;
    if (this.dcQueue.length || this.resourceQueue.length ||
        this.metricQueue.length || this.aaradrQueue.length) {
        logger.debug('dcQueue.length=', this.dcQueue.length,
            ', resourceQueue.length=', this.resourceQueue.length,
            ', metricQueue.length=', this.metricQueue.length,
            ', aaradrQueue.length=', this.aaradrQueue.length);
    }

    if (this.dcQueue.length > 0) {
        task = this.dcQueue.shift();
    } else if (this.resourceQueue.length > 0) {
        task = this.resourceQueue.shift();
    } else if (this.metricQueue.length > 0) {
        task = this.metricQueue.shift();
    } else if (this.aaradrQueue.length > 0) {
        task = this.aaradrQueue.shift();
    } else if (this.other.length > 0) {
        task = this.other.shift();
    }
    if (task) {
        task.retry = task.retry || 0;
        httpSend(task, this.name, task.url, task.payload, task.type,
            task.additionalHeader, undefined, task.callback);
    }
};

exports.getQueue = function(name) {
    if (!queues[name]) {
        queues[name] = new SenderQueue(name);
        var inverval = setInterval(function() { queues[name].consume(); }, INTERVAL);
        inverval.unref();
    }
    return queues[name];
};
