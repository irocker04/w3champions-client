# w3champions-client

The W3Champions-client project contains all files which are statically hosted to support the launcher (https://github.com/padjon/w3champions-launcher) with the required scripts and patching data. It includes all logic of the launcher.


## How to develop the launcher?

You can test your launcher scripts by two ways. Running it with an mocked electron interface directly in node (npm run launcher-dev) or running it against a launcher build which provides a real electron API (see next chapter).

## How to test against the launcher locally?

1 Start the local webserver of this project to deliver the needed ressources locally. (npm start)

2 Download the launcher project from https://github.com/padjon/w3champions-launcher. Build the launcher. 

3 Execute the created binary with the -devmode start argument.

The -devmode argument lets the launcher not requesting scripts from the official server but from localhost:8080 - where the webserver from 1 is listening.


## All available NPM commands
The following commands are available:

```javascript
npm run launcher-dev  
```
runs the launcher-main.js with mocked electron components (dev-mock.js)

```javascript 
npm start  
```
runs a local http-server for development purpose

```javascript 
npm run patch
npm run patch-dev
```
Recreates the patch.json file with the latest patching data hashes from /patches
