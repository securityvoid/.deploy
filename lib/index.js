'use strict';
const path = require('path');
const fs = require('fs');
const q = require('q');
const rl = require('readline');

/**
 * getFunctionFolders - Gets a list of all the folders that contain functions.
 * @param config
 * @returns {*|promise|h|*|promise|h}
 */
module.exports.getFunctionFolders = function(config){
    console.log("Start getFunctionFolders");
    var deferred = q.defer();
    var topFolders = [];
    fs.readdir(process.env.DEPLOYMENT_SOURCE, function(err,files){
        if(err){
            deferred.reject({success : false, error : err});
        } else {
            for(var i=0; i<files.length; i++){
                if( config.exclude_dir.indexOf(files[i]) < 0 && fs.statSync(path.join(process.env.DEPLOYMENT_SOURCE, files[i])).isDirectory()) {
                    topFolders.push(files[i]);
                }
            }
            deferred.resolve({success : true, top_folders : topFolders, config : config });
        }
    });
    return deferred.promise;
}

/**
 * copyFiles - Copies Folders that are untouched to the "dist" folder.
 * @param config - Configuration object with directories to exclude, etc.
 * @param folder - the folder that needs to be copied.
 * @returns {*|promise|h|*|promise|h} - Object with success/failure details.
 */
module.exports.copyFiles = function(config, folder){
    console.log("Start copyFiles");
    var deferred = q.defer();
    var fromDir = path.join(process.env.DEPLOYMENT_SOURCE, folder);
    var toDir = path.join(process.env.DEPLOYMENT_SOURCE, "dist", folder);
    var exclude = config.exclude_dir;
    fs.copy(fromDir, toDir,
        function(file){
            for(var i = 0; i < exclude.length; i++){
                var targetFile = path.normalize(file);
                var filter_base = targetFile.substr(process.env.DEPLOYMENT_SOURCE.length).replace(/^\\/,"").split(path.sep)[0];
                var filter = path.join(process.env.DEPLOYMENT_SOURCE, filter_base, exclude[i]);
                if(targetFile.startsWith(filter)){
                    return false;
                }

            }
            return true;
        }, function(err){
            if (err)
                deferred.reject({success : false, error : err});
            else
                deferred.resolve({success : true, config : config});
        });
    return deferred.promise;
}

module.exports.createDependencyFile = function(config, folder){
    console.log("Start createDependencyFile");
    const deferred = q.defer();
    const base = process.env.DEPLOYMENT_SOURCE;
    const index = path.join(base, folder, "index.js");

    fs.readFile(index, 'utf8', function (err,data) {
        if (err) {
            if(err.code == 'ENOENT')
                deferred.reject({success : true, error : err, config : config});
            else
                deferred.reject({success : false, error : err, config : config});

            return deferred.promise;
        }
        var regex = /require\s*\(['"]([^'"]+)['"]\)/g;
        var match = regex.exec(data);

        var libraries = {};
        while (match !== null) { //Grab/Store all libraries to remove duplicates
            libraries[match[1]] = match[0];
            match = regex.exec(data);
        }

        var jsContents = "\tglobal.azureDeps = {\n";
        for (var key in libraries) {
            if (libraries.hasOwnProperty(key)) {
                jsContents += "\t\t" + cleanLibraryName(key) + " : " + libraries[key] + ",\n";
            }
        }
        getWildCardPaths(index, data).then(resolveWildCards).then(generateWildCardRequires).then(function(wildcardJS){
            jsContents += wildCardJS;
            jsContents = jsContents.slice(0, -2) + "\n\t};";
            fs.writeFile(path.join(folder, config.outputFile), jsContents, function(err){
                deferred.resolve({success : true, config: config});
            });
        }).done();
    });

    return deferred.promise;
}

/**
 * updateIndex - Updates the copied index to point to the appropriate requiered files.
 * @param config - The config object
 * @param folder - The folder to get the index from
 * @returns {*|promise|h|*|promise|h} - Resolve on Success Reject on Failure
 */
module.exports.updateIndex = function(config, folder){
    console.log("Start updateIndex");
    const deferred = q.defer();
    const base = process.env.DEPLOYMENT_SOURCE;
    const index = path.join(base, "dist", folder, "index.js");
    const lineReader = rl.createInterface({ input: require('fs').createReadStream(index) });

    var jsContents = ""
    var regex = /require\s*\(['"]([^'"]+)['"]\)/g;;
    var count = 0;
    lineReader.on('line', function (line) {
        var after = "";
        if(count == 0){//If its the first row, figure out where to put require.
            //If the first line is "use strict", but it after that line
            if((line.includes('"use strict";') || line.includes("use strict';"))) {
                after = "require('./" + config.outputFile + "');\n";
            } else { //Otherwise put it at the beginning
                jsContents = "require('./" + config.outputFile + "');\n";
            }
            count++;
        }
        line = line.replace(regex, function(match, $1, offset, original) {
                return "global.azureDeps." + cleanLibraryName($1);
            }) + "\n";
        jsContents += line + after;
    }).on('close', function(){
        fs.writeFileSync(index, jsContents);
        deferred.resolve({success : true});
    });

    return deferred.promise;
}

/**
 * finalMove - Moves the files into the wwwroot folder.
 * @param config - The configuration File
 * @returns {*|promise|h|*|promise|h} - Resolve on success, reject on failure.
 */
module.exports.finalMove = function(config){
    console.log("Start finalMove");
    const deferred = q.defer();
    var deploy_dir = path.normalize(process.env.DEPLOYMENT_SOURCE);
    var base = path.join(process.env.DEPLOYMENT_SOURCE, "..");
    console.log("Copying host.json");
    fs.copySync(path.join(deploy_dir, "host.json"), path.join(deploy_dir, "dist", "host.json"));
    console.log("Moving wwwroot to wwwroot2");
    fs.rename(path.join(base, "wwwroot"), path.join(base, "wwwroot2"), function(err){
        if(err) {
            console.log("Error wwwroot copy:",JSON.stringify(err));
            deferred.reject({success : false, "error" : err});
        } else {
            console.log("Moving dist to wwwroot");
            fs.rename(path.join(deploy_dir, "dist"), path.join(base, "wwwroot"), function(err){
                if(err) {
                    deferred.reject({success : false, "error" : err});
                } else {
                    console.log("Removing wwwroot2");
                    fs.remove(path.join(base, "wwwroot2"), function(err){
                        console.log("Completed wwwroot2 remove.")
                        if(err) {
                            deferred.reject({success : false, "error" : err});
                        } else {
                            deferred.resolve({success : true});
                        }
                    });
                }
            });
        }
    });
    return deferred.promise;
}


//*********************** NON EXPORTED HELPER FUNCTIONS ***************************

/**
 * cleanLibraryName - Small helper function to standardize library naming for requires.
 * @param name - What's inbetween the "require".
 * @returns {string} - The sanitized name
 */
function cleanLibraryName(name){
    return name.replace(/[^a-zA-Z0-9]/g, '');
}


/**
 * getWildCardPaths - Give a file name, extracts all requires with path.join's that include variables.
 * @param file - The name of the file to search
 * @returns {*|promise|h|} - Object { FILE_PATTERN : {find : REQUIRE_STATEMENT, files: []}}
 */
function getWildCardPaths(file, data){
    var deferred = q.defer();
    var wildCardPaths = {};
    const replace = {
        "__dirname" : "'" + path.dirname(file) + "'"
    };

    if (err) {
        if(err.code == 'ENOENT')
            deferred.reject({success : true, action: "getWildCardpaths ReadFile", file: file, error: error});
        else
            deferred.reject({success : false, action: "getWildCardpaths ReadFile", file: file, error: error});

        return deferred.promise;
    }

    var regexPathRequire = /require\s*\(\s*\(*\s*path\.join\s*\(([^\)]+)\)\s*\)*\s*\)/g
    var matchPathRequire = regexPathRequire.exec(data);

    while (matchPathRequire !== null) {
        var wildCardName = matchPathRequire[1].split(",").map(function (value) {
            //Make replacements for known variables
            var updated = (replace[value]) ? value.replace(value, replace[value]).trim() : value.trim();

            var varReplaced = updated.split("+").map(function (section) {
                if (/^'.+'$/.test(section.trim())) //If surrounded by ', its a String so return value with ' trimmed
                    return section.trim().replace(/^'/, '').replace(/'$/, '');
                if (/^".+"$/.test(section.trim())) //If surrounded by ", its a String so return value with " trimmed
                    return section.trim().replace(/^"/, '').replace(/"$/, '');
                //If not, its a var, so return a wildcard.
                return "*";
            }).join('');

            return varReplaced;
        }).join(path.sep);
        wildCardPaths[wildCardName] = {};
        wildCardPaths[wildCardName].find = matchPathRequire[0];
        wildCardPaths[wildCardName].files = [];
        matchPathRequire = regexPathRequire.exec(data);
    }
    deferred.resolve(wildCardPaths);

    return deferred.promise;
}

/**
 * resolveWildCards - Takes a list of wildcard patterns and gets files that match that patterns.
 * @param wildCardPaths - Object of the format that getWildCardPaths returns e.g.  - Object { FILE_PATTERN : {find : REQUIRE_STATEMENT, files: []}}
 * @returns {*|promise|h} - Object { FILE_PATTERN : {find : REQUIRE_STATEMENT, files: [FILE_MATCH1, FILE_MATCH2]}} with files filled out
 */
function resolveWildCards(wildCardPaths){
    var deferred = q.defer();
    var promises = [];
    for (var filePath in wildCardPaths) {
        if (!wildCardPaths.hasOwnProperty(filePath)) continue;
        var normalPath = path.normalize(filePath);

        if(normalPath.indexOf("*") < 0){//IF it doesn't have a *, its not a wildcard
            wildCardPaths[filePath] = normalPath;
            continue;
        }

        var basePath = normalPath.substr(0, normalPath.indexOf("*"));
        var baseDir = basePath.substr(0, basePath.lastIndexOf(path.sep));

        promises.push(wildCardPaths[filePath].promise = getFiles(baseDir, normalPath));
    }
    q.allSettled(promises).then(function(results){
        for (var filePath in wildCardPaths) {
            if (!wildCardPaths.hasOwnProperty(filePath)) continue;
            wildCardPaths[filePath].files = wildCardPaths[filePath].promise.valueOf();
            delete wildCardPaths[filePath].promise;
        }
        deferred.resolve(wildCardPaths);
    }).catch(function(error){
        deferred.reject({ success : false, action: "resolveWildCards", error: error });
    });
    return deferred.promise;
}

/**
 * getFiles - Searches the given base directory for items that match the filePattern.
 * @param baseDir - The base directory to search e.g. c:\dev\src
 * @param filePattern - A file pattern with * for wildcards
 * @returns {*|promise|h} - Array of File matches on resolve [FILE_ONE, FILE_TWO], detailed error object on reject
 */
function getFiles(baseDir, filePattern){
    const deferred = q.defer();

    walk(baseDir, filePattern, function(err, files){
        if(err)
            deferred.reject({success: false, action: "getFiles", dir : baseDir, pattern: filePattern, files: files, error : err });
        else{
            deferred.resolve(files);
        }

    });

    function walk(dir, fileFilter, done) {
        var results = [];
        fs.readdir(dir, function(err, list) {
            if (err) return done(err);
            var pending = list.length;
            if (!pending) return done(null, results);
            list.forEach(function(file) {
                file = path.resolve(dir, file);
                fs.stat(file, function(err, stat) {
                    if (stat && stat.isDirectory()) {
                        if(matchesFilePattern(file, fileFilter, true))
                            walk(file, fileFilter, function(err, res) {
                                results = results.concat(res);
                                if (!--pending) done(null, results);
                            });
                        else
                        if (!--pending) done(null, results);
                    } else {
                        if(matchesFilePattern(file, fileFilter, false))
                            results.push(file);
                        if (!--pending) done(null, results);
                    }
                });
            });
        });
    };
    return deferred.promise;
}

/**
 * matchesFilePattern - Helper function for getFiles that tests to see if a given file matches the described pattern
 * @param file - The file to see if it matches.
 * @param pattern - The pattern to match
 * @param isDir - Is it a directory? If so then a subdir of a valid path is also valid (so getFiles will recures properly)
 * @returns {boolean} - True if it matches the file pattern, false if it does not.
 */
function matchesFilePattern(file, pattern, isDir){
    var patterns = pattern.split("*");
    var toMatch = file;
    for(var i=0; i<patterns.length; i++){
        switch(i){
            case (patterns.length - 1):
                //If the pattern matches return true, or if there are no more slashes then the wildcard would have covered i
                if(toMatch.endsWith(patterns[i]) || ((toMatch.match(new RegExp("\\" + path.sep, "g")) || []).length < 2))
                    return true;
                else
                    return false;
            case 0:
                if(!toMatch.startsWith(patterns[i]))
                    return false;
                toMatch = toMatch.replace(patterns[i],'');
                break;
            default:
                var index = toMatch.indexOf(patterns[i]);
                //If its a file, it needs to match 100%
                if( index < 0 && !isDir)
                    return false;
                if( index < 0 && isDir){//If its a dir, this could still be a match
                    //Find the last slash and take before that as a pattern
                    var p = patterns[i].substr(0,patterns[i].lastIndexOf(path.sep));
                    if(p === "")//If there isn't a slash, & a dir, this would be covered by last wildcard.
                        return true;
                    var m = toMatch.indexOf(p);
                    if(m < 0) //If there is no match to this pattern, its definitely false
                        return false;
                    //If there is a match, and when you find the index of that match there is nothing left toMatch
                    //Then this dir is still potentially in scope.
                    if(m >= 0 && toMatch.substr(m + p.length).trim().length < 1)
                        return true
                    else //If not, return false
                        return false;
                }
                if(index >= 0){
                    toMatch = toMatch.substr(index + patterns[i].length);
                }
        }
    }
}

/**
 * generateWildCardRequires  - Takes the wildCardPaths output from resolveWildCards and generates the JavaScript to include/reference files
 * @param wildCardPaths - Output format from resolveWildCards - e.g. Object { FILE_PATTERN : {find : REQUIRE_STATEMENT, files: [FILE_MATCH1, FILE_MATCH2]}}
 * @returns {*|promise|h} - String - The JavaScript to create the includes.
 */
function generateWildCardRequires(wildCardPaths){
    var deferred = q.defer();
    var projectBase = path.normalize(process.env.DEPLOYMENT_SOURCE + path.sep);
    var requires = "";

    for (var pattern in wildCardPaths) {
        var files = wildCardPaths[pattern].files;
        for(var i = 0; i < files.length; i++){
            requires += '\t\t"' + files[i].replace(projectBase, '') + '":\trequire("' + files[i] + '"),\n';
        }
    }
    deferred.resolve(requires);
    return deferred.promise;
}
