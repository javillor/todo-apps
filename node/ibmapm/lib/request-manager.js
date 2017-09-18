// Copyright IBM Corp. 2017. All Rights Reserved.
// Node module: ibmapm
// This file is licensed under the Apache License 2.0.
// License text available at https://opensource.org/licenses/Apache-2.0

var jso = require('./jso');
var appmetrics = global.APPMETRICS = global.APPMETRICS || require('appmetrics');
var healthcenter = global.HEALTHCENTER = global.HEALTHCENTER || appmetrics.monitor();
var jsonSender = require('./json-sender').jsonSender;
var commonTools = require('./tool/common');

var log4js = require('log4js');
var logger = log4js.getLogger('knj_log');

var egdeReqCount = 0;

function RequestManager() {
};

RequestManager.prototype.start = function(envType) {
    this.envType = envType;

    healthcenter.on('request', function(data) {
        if (typeof (data.type) !== 'string') return;
        if (data.type.toUpperCase() !== 'HTTP') return;
        if (process.env.LOGS_DEBUG === 'true') {
            logger.error('********** request event data **********');
            logger.error(data);
        }
        if (typeof (data.request) !== 'undefined') {
            if ((commonTools.testTrue(process.env.KNJ_ENABLE_DEEPDIVE)
                    && process.env.KNJ_ENVTYPE !== 'Cloudnative')
                || (commonTools.testTrue(process.env.KNJ_ENABLE_TT)
                    && process.env.KNJ_ENVTYPE === 'Cloudnative')) {
                writeToJso(data.request);
            }

            if (commonTools.testTrue(process.env.KNJ_ENABLE_TT) &&
                    (process.env.KNJ_ENVTYPE === 'Cloudnative'
                || process.env.KNJ_ENVTYPE === 'CloudOE')) {
                // send AAR from http request at resource level
                jsonSender.sendAARTT(data);
            }

            if (commonTools.testTrue(process.env.KNJ_ENABLE_DEEPDIVE)
                    && process.env.KNJ_ENVTYPE === 'Cloudnative') {
                // send ADR from http request at resource level
                jsonSender.sendADR(data);
            }
        }
    });
};

var writeToJso = function(data) {
    var jsoFile;
    if (process.env.KNJ_ENVTYPE !== 'Cloudnative') {
        jsoFile = jso.open();
    }
    // if (data.tracedStart || data.type.toUpperCase() === 'HTTP') {
    if (process.env.KNJ_ENVTYPE !== 'Cloudnative') {
        jsoFile.samplingCount = egdeReqCount;
    }
    egdeReqCount++;
    writeRequest(jsoFile, data);
    // }
};

var writeRequest = function(jsoFile, data) {
    if (process.env.KNJ_ENVTYPE !== 'Cloudnative') {
        if (data.type) {
            writeStartRequest(jsoFile, data);
        } else {
            writeStartMethod(jsoFile, data);
        }
    }
    if (data.children.length > 0 && data.tracedStart) {
        data.children.forEach(function(child) {
            if (process.env.LOGS_DEBUG === 'true'){
                logger.error('********** children of request event data **********');
                logger.error(child.name);
                logger.error(child.type);
                logger.error(child.id);
                logger.error(child.stack);
                logger.error(child.timer);
            }
            writeRequest(jsoFile, child);

        });
        if (/* data.traceStopped && */process.env.KNJ_ENVTYPE !== 'Cloudnative') {
            if (data.type) {
                writeStopRequest(jsoFile, data);
            } else {
                writeStopMethod(jsoFile, data);
            }
        }
    } else {
        if (/* data.traceStopped && */process.env.KNJ_ENVTYPE !== 'Cloudnative') {
            if (data.type) {
                writeStopRequest(jsoFile, data);
            } else {
                writeStopMethod(jsoFile, data);
            }
        }
    }
};

var writeStartMethod = function(jsoFile, data) {
    var parentId;
    if (data.parent) {
        if (data.parent.type) {
            parentId = data.parent.id;
        } else {
            parentId = data.parent.methId;
        }
    }
    logger.debug('jsoFile.startMethod:', data.top.id, data.timer, data.name, parentId);
    data.methId = jsoFile.startMethod(data.top.id, data.timer, data.name, parentId);
};

var writeStopMethod = function(jsoFile, data) {
    var parentId;
    if (data.parent) {
        if (data.parent.type) {
            parentId = data.parent.id;
        } else {
            parentId = data.parent.methId;
        }
    }
    logger.debug('jsoFile.stopMethod:', data.top.id, data.timer, data.name, parentId,
        data.stack, data.context);
    jsoFile.stopMethod(data.top.id, data.timer, data.name, parentId, data.stack, data.context);
};

var writeStartRequest = function(jsoFile, data){
    logger.debug('jsoFile.startRequest:', data.top.id, data.id, data.timer, data.top === data,
        data.type.toUpperCase(), data.name);
    jsoFile.startRequest(data.top.id, data.id, data.timer, data.top === data,
        data.type.toUpperCase(), data.name);
};

var writeStopRequest = function(jsoFile, data) {
    logger.debug('jsoFile.stopRequest:', data.top.id, data.id, data.timer, data.top === data,
            data.type.toUpperCase(), data.name, data.stack, data.context);
    jsoFile.stopRequest(data.top.id, data.id, data.timer, data.top === data,
            data.type.toUpperCase(), data.name, data.stack, data.context);
};

exports.requestManager = new RequestManager();
exports.resetEgdeReqCount = function(){
    egdeReqCount = 0;
};
