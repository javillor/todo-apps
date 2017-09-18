// Copyright IBM Corp. 2017. All Rights Reserved.
// Node module: ibmapm
// This file is licensed under the Apache License 2.0.
// License text available at https://opensource.org/licenses/Apache-2.0

var log4js = require('log4js');
var properties = require('properties');
var fs = require('fs');
var path = require('path');

//    initialize log
if (!process.env.KNJ_LOG_TO_FILE) {
    log4js.loadAppender('console');
} else {
    log4js.loadAppender('file');
    log4js.addAppender(log4js.appenders.file('nodejs_dc.log'), 'knj_log');
}

var logger = log4js.getLogger('knj_log');
var loglevel = process.env.KNJ_LOG_LEVEL ? process.env.KNJ_LOG_LEVEL.toUpperCase() : undefined;
if (loglevel &&
        (loglevel === 'OFF' || loglevel === 'ERROR' || loglevel === 'INFO' ||
                loglevel === 'DEBUG' || loglevel === 'ALL')) {
    logger.setLevel(loglevel);
    logger.info('KNJ_LOG_LEVEL is set to', loglevel);
} else {
    logger.setLevel('INFO');
    logger.info('KNJ_LOG_LEVEL is not set or not set correctly through environment variables.');
    logger.info('The program set default log level to INFO.');
}

//    initialize log end

//    initialize different code path - BI/BAM/Agent
var configObj;
if (!process.env.MONITORING_SERVER_TYPE) {
    try {
        var configString = fs.readFileSync(path.join(__dirname,
            '/etc/config.properties'));

        configObj = properties.parse(configString.toString(),
            {
                separators: '=',
                comments: [';', '@', '#']
            }
        );
        process.env.MONITORING_SERVER_TYPE = configObj.MONITORING_SERVER_TYPE;
    } catch (e) {
        logger.error('Failed to read etc/config.properties');
        logger.error('Use default MONITORING_SERVER_TYPE: BAM');
        logger.info(e);
        process.env.MONITORING_SERVER_TYPE = 'BAM';
    }
}

if (!process.env.MONITORING_SERVER_URL
    && configObj && configObj.MONITORING_SERVER_URL) {
    process.env.MONITORING_SERVER_URL = configObj.MONITORING_SERVER_URL;
}
if (!process.env.MONITORING_APPLICATION_NAME
    && configObj && configObj.MONITORING_APPLICATION_NAME) {
    process.env.MONITORING_APPLICATION_NAME = configObj.MONITORING_APPLICATION_NAME;
}
if (!process.env.MONITORING_SECURITY_URL
    && configObj && configObj.MONITORING_SECURITY_URL) {
    process.env.MONITORING_SECURITY_URL = configObj.MONITORING_SECURITY_URL;
}
if (!process.env.MONITORING_SERVER_NAME
    && configObj && configObj.MONITORING_SERVER_NAME) {
    process.env.MONITORING_SERVER_NAME = configObj.MONITORING_SERVER_NAME;
}

if (process.env.MONITORING_SECURITY_URL) {
    process.env.APM_KEYFILE_URL = process.env.MONITORING_SECURITY_URL;
}

logger.info('==========Inital parameters setting==========');
logger.info('Monitoring server type: ', process.env.MONITORING_SERVER_TYPE);
logger.info('Monitoring server url: ', process.env.MONITORING_SERVER_URL);
logger.info('Monitoring application name:', process.env.MONITORING_APPLICATION_NAME);
logger.info('Monitoring security url:', process.env.MONITORING_SECURITY_URL);
logger.info('Monitoring server SNI(Server Name Indication):', process.env.MONITORING_SERVER_NAME);
logger.info('==========End of inital parameters setting==========');

// initialize different code path - BI/BAM/Agent end

// initialize shared configurations:
if (typeof (process.env.KNJ_ENABLE_TT) === 'undefined' && configObj && configObj.KNJ_ENABLE_TT) {
    process.env.KNJ_ENABLE_TT = configObj.KNJ_ENABLE_TT;
}

if (!process.env.KNJ_LOG_LEVEL && configObj && configObj.KNJ_LOG_LEVEL) {
    process.env.KNJ_LOG_LEVEL = configObj.KNJ_LOG_LEVEL;

    loglevel = process.env.KNJ_LOG_LEVEL ? process.env.KNJ_LOG_LEVEL.toUpperCase() : undefined;
    if (loglevel &&
            (loglevel === 'OFF' || loglevel === 'ERROR' || loglevel === 'INFO' ||
                    loglevel === 'DEBUG' || loglevel === 'ALL')) {
        logger.setLevel(loglevel);
        logger.info('KNJ_LOG_LEVEL is set to', loglevel);
    } else {
        logger.setLevel('INFO');
        logger.info('KNJ_LOG_LEVEL is not set or not set correctly through config files.');
        logger.info('The program set default log level to INFO.');
    }
}
if (typeof (process.env.KNJ_SAMPLING) === 'undefined' && configObj && configObj.KNJ_SAMPLING) {
    process.env.KNJ_SAMPLING = configObj.KNJ_SAMPLING;
}

if (typeof (process.env.KNJ_MIN_CLOCK_TRACE) === 'undefined'
    && configObj && configObj.KNJ_MIN_CLOCK_TRACE) {
    process.env.KNJ_MIN_CLOCK_TRACE = configObj.KNJ_MIN_CLOCK_TRACE;
}

if (typeof (process.env.KNJ_MIN_CLOCK_STACK) === 'undefined'
    && configObj && configObj.KNJ_MIN_CLOCK_STACK) {
    process.env.KNJ_MIN_CLOCK_STACK = configObj.KNJ_MIN_CLOCK_STACK;
}

if (typeof (process.env.KNJ_DISABLE_METHODTRACE) === 'undefined'
    && configObj && configObj.KNJ_DISABLE_METHODTRACE) {
    process.env.KNJ_DISABLE_METHODTRACE = configObj.KNJ_DISABLE_METHODTRACE;
}
if (typeof (process.env.KNJ_AAR_BATCH_FREQ) === 'undefined'
    && configObj && configObj.KNJ_AAR_BATCH_FREQ) {
    process.env.KNJ_AAR_BATCH_FREQ = configObj.KNJ_AAR_BATCH_FREQ;
}
if (typeof (process.env.KNJ_AAR_BATCH_COUNT) === 'undefined'
    && configObj && configObj.KNJ_AAR_BATCH_COUNT) {
    process.env.KNJ_AAR_BATCH_COUNT = configObj.KNJ_AAR_BATCH_COUNT;
}
// initialize shared configurations end

// initialize BAM configuration
var bamConfObj;
if (process.env.MONITORING_SERVER_TYPE === 'BAM') {
    try {
        var bamConfString = fs.readFileSync(path.join(__dirname,
            '/etc/bam.properties'));

        bamConfObj = properties.parse(bamConfString.toString(),
            {
                separators: '=',
                comments: [';', '@', '#']
            }
        );
    } catch (e) {
        logger.error('Failed to read etc/bam.properties.');
        logger.error('Use default BAM configuration.');
        logger.info(e);
    }

    if (bamConfObj) {
        global.KNJ_AAR_BATCH_COUNT = process.env.KNJ_AAR_BATCH_COUNT ||
            bamConfObj.KNJ_AAR_BATCH_COUNT;
        global.KNJ_AAR_BATCH_FREQ = process.env.KNJ_AAR_BATCH_FREQ ||
            bamConfObj.KNJ_AAR_BATCH_FREQ;
        global.KNJ_ADR_BATCH_COUNT = process.env.KNJ_ADR_BATCH_COUNT ||
            bamConfObj.KNJ_ADR_BATCH_COUNT;
        global.KNJ_ADR_BATCH_FREQ = process.env.KNJ_ADR_BATCH_FREQ ||
            bamConfObj.KNJ_ADR_BATCH_FREQ;
    }
    global.KNJ_ADR_BATCH_COUNT = global.KNJ_ADR_BATCH_COUNT || 100;
    global.KNJ_ADR_BATCH_FREQ = global.KNJ_ADR_BATCH_FREQ || 60;

    logger.info('==========Inital BAM parameters setting==========');
    logger.info('KNJ_AAR_BATCH_COUNT', global.KNJ_AAR_BATCH_COUNT);
    logger.info('KNJ_AAR_BATCH_FREQ', global.KNJ_AAR_BATCH_FREQ);
    logger.info('KNJ_AAR_BATCH_COUNT', global.KNJ_ADR_BATCH_COUNT);
    logger.info('KNJ_AAR_BATCH_FREQ', global.KNJ_ADR_BATCH_FREQ);
    logger.info('==========End of inital BAM parameters setting==========');

}

if (process.env.MONITORING_SERVER_TYPE === 'BI') {
    global.KNJ_AAR_BATCH_COUNT = process.env.KNJ_AAR_BATCH_COUNT || 100;
    global.KNJ_AAR_BATCH_FREQ = process.env.KNJ_AAR_BATCH_FREQ || 60;

    logger.info('==========Inital BI parameters setting==========');
    logger.info('KNJ_AAR_BATCH_COUNT', global.KNJ_AAR_BATCH_COUNT);
    logger.info('KNJ_AAR_BATCH_FREQ', global.KNJ_AAR_BATCH_FREQ);
    logger.info('KNJ_DISABLE_METHODTRACE', process.env.KNJ_DISABLE_METHODTRACE);
    logger.info('==========End of inital BI parameters setting==========');
}
// initialize BAM configuration end


var plugin = require('./lib/plugin.js').monitoringPlugin;
switch (process.env.MONITORING_SERVER_TYPE) {
case 'BAM':
    plugin.init('Cloudnative');
    break;
case 'BI':
    plugin.init('CloudOE'); //    for M&A
    break;
case 'Agent':
    plugin.init('SaaS');    //    for SaaS
    break;
default:
    plugin.init('Cloudnative');
}
