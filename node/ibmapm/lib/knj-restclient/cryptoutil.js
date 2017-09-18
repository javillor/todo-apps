var crypto = require('crypto');
var log4js = require('log4js');

if (!process.env.KNJ_LOG_TO_FILE) {
    log4js.loadAppender('console');
} else {
    log4js.loadAppender('file');
    log4js.addAppender(log4js.appenders.file('nodejs_restclient.log'), 'restclient_cryptoutil.js');
}

var logger = log4js.getLogger('restclient_cryptoutil.js');
var loglevel = process.env.KNJ_LOG_LEVEL ? process.env.KNJ_LOG_LEVEL.toUpperCase() : undefined;
if (loglevel &&
    (loglevel === 'OFF' || loglevel === 'ERROR' || loglevel === 'INFO' ||
        loglevel === 'DEBUG' || loglevel === 'ALL')) {
    logger.setLevel(loglevel);
} else {
    logger.setLevel('INFO');
}

var algorithm = 'aes-128-cbc';
var clearEncoding = 'utf8';
var cipherEncoding = 'base64';
var key;
var iv;

module.exports.initkey = function(data) {
    var buf = crypto.createHash('sha256').update(data, clearEncoding).digest();
    key = buf.slice(0, 16);
    iv = buf.slice(16);
};

module.exports.obfuscate = function(data) {
    logger.debug('Original cleartext: ' + data);
    var cipher = crypto.createCipheriv(algorithm, key, iv);
    cipher.setAutoPadding(true);
    var cipherChunks = [];
    cipherChunks.push(cipher.update(data, clearEncoding, cipherEncoding));
    cipherChunks.push(cipher.final(cipherEncoding));
    logger.debug(cipherEncoding + ' ciphertext: ' + cipherChunks.join(''));
    return cipherChunks.join('');
};

module.exports.unobfuscate = function(data) {
    logger.debug('ciphertext: ' + data);
    var decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAutoPadding(true);
    var plainChunks = [];
    plainChunks.push(decipher.update(data, cipherEncoding, clearEncoding));

    plainChunks.push(decipher.final(clearEncoding));
    logger.debug(clearEncoding + ' plaintext deciphered: ' + plainChunks.join(''));
    return plainChunks.join('');
};

// this.initkey('54c1bc15-7e8b-4286-b3ef-ff458f8f1108');

// var obf = this.obfuscate('shiyanfeng');
// console.log(obf);
// var unobf = this.unobfuscate(obf);
// console.log(unobf);
