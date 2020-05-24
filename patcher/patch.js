const { hashElement } = require('folder-hash');
const fs = require('fs');

const patchPath = __dirname + '/patches/';
let folderHashes = {};
let version = '';
const hashes = [];

hashElement(patchPath, {
    files: {
        ignoreBasename: true,
        ignoreRootName: true
    },
}).then(hashes => {
    folderHashes = JSON.parse(JSON.stringify(hashes));
    folderHashes.name = '';
    version = folderHashes.hash;
    hashes = getHashes(folderHashes);

    fs.writeFileSync('patcher/patch.json', JSON.stringify({
        version: version,
        hashes: hashes
    }));

    console.log("successfully recreated patch.json");
});

function getHashes(hashObject, basePath = '') {
    let result = [];
    if (hashObject.children) {
        basePath += (hashObject.name != '') ? hashObject.name + '/' : '';
        for (const child of hashObject.children) {
            result = result.concat(getHashes(child, basePath));
        }
    } else {
        const filePath = basePath + hashObject.name;
        result = [{ hash: hashObject.hash, path: filePath }];
    }
    return result;
}