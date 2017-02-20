'use strict';
const path = require('path');
const fs = require('fs-extra');
const q = require('q');
require('dotenv').config({path: path.join(process.env.DEPLOYMENT_SOURCE, '.deployment') });

//******************** EXPORTED **********************************************
module.exports.createDistribution = function(webPackLib){
    console.log("Start: createDistribution");
    var deferred = q.defer();
    var creationResults = [];
    checkEnvVariables();
    fs.removeSync(path.join(process.env.DEPLOYMENT_SOURCE, process.env.DEPLOY_DIST_FOLDER));
    getFunctionFolders().then(function(results){
        var top_folders = results.top_folders;
        for(var x = 0; x < top_folders.length; x++){
            console.log("Start Folder:", top_folders[x]);
            (function(x){
                creationResults.push(copyFiles(top_folders[x]).then(function(){
                    return createDependencyFile(top_folders[x]).then(function(){
                        return webPackIt(top_folders[x], webPackLib);
                    });
                }).catch(function(error){
                    var subDefer = q.defer();
                    if(error.success)
                        subDefer.resolve(error);
                    else
                        subDefer.reject({success : false, error : error});
                    return subDefer.promise;
                }));
            }(x));
        }
        q.allSettled(creationResults).then(function(results){
            finalMove().then(function(results){
                deferred.resolve(results);
            }, function(error){
                deferred.reject({success: false, error: error});
            })
        });
    });
    return deferred.promise;
}

function webPackIt(folder, webPackLib){
    console.log("Start createDependencyFile");
    const deferred = q.defer();
    const base = process.env.DEPLOYMENT_SOURCE;
    const index = path.join(base, folder, "index.js");
    const outputDir = path.join(base, process.env.DEPLOY_DIST_FOLDER, folder);
    console.log("index:" + index, "outputDir:", outputDir);

    console.log("Running Webpack...");
    console.log("base:" + base, "folder:" + folder, "outFile:" + process.env.WEBPACK_OUTPUT_FILE, "outputDir:" + outputDir);
    var compiler = webPackLib({
        entry: path.join(base, folder, process.env.WEBPACK_OUTPUT_FILE),
        target: 'node',
        output : {
            path : outputDir,
            filename : process.env.WEBPACK_OUTPUT_FILE,
            library: "index",
            libraryTarget: "commonjs2"
        },
        node: {
            __filename: false,
            __dirname: false
        },
        plugins: [
            new webPackLib.optimize.UglifyJsPlugin({
                compress: {
                    warnings: false,
                },
                output: {
                    comments: false,
                }
            })
        ],
        module: {
            loaders: [{
                test: /\.json$/,
                loader: 'json-loader'
            }]
        }
    }, function(err, stats) {
        //Delete the temp file once created
        try {
            fs.unlinkSync(path.join(base, folder, process.env.WEBPACK_OUTPUT_FILE));
        } catch (error){
            if(error.code !== "ENOENT")
                err = error;
        }
        if(err){
            console.log("Full Error");
            console.log(JSON.stringify(err));
            deferred.reject({success: false, error : err});
        }
        var jsonStats = stats.toJson();
        if(jsonStats.errors.length > 0){
            console.log("JSonStats:")
            console.log(JSON.stringify(jsonStats));
            deferred.reject({success: false, error : jsonStats.errors});
        }
        if(jsonStats.warnings.length > 0)
            deferred.resolve({success : true, warnings : jsonStats.warnings});
        deferred.resolve({success : true});
    });

    return deferred.promise;
}


function checkEnvVariables(){
    console.log("Validating and Defaulting ENV variables.");
    process.env.WEBPACK_OUTPUT_FILE = (process.env.WEBPACK_OUTPUT_FILE) ? process.env.WEBPACK_OUTPUT_FILE : "azure.deps.js";
    process.env.DEPLOY_DIST_FOLDER = (process.env.DEPLOY_DIST_FOLDER) ? process.env.DEPLOY_DIST_FOLDER : "dist";

    try{
        var t = JSON.parse(process.env.DEPLOY_COPY_FILES);
        if(t.length < 1)
            throw new Error("Default Not Set");
    } catch(exception){
        console.log("WARNING: DEPLOY_COPY_FILES is not set, or not set to an array. Values defaulted.");
        console.log('Enter a proper value in .deployment or as an ENV variable. e.g. ["index.js", "azure.deps.js", "package.json"]');
        process.env.DEPLOY_COPY_FILES = '[ "index.js",  "' + process.env.WEBPACK_OUTPUT_FILE + '", "package.json" ]';
    }

    try{
        var t = JSON.parse(process.env.DEPLOY_EXCLUDE_FILES);
        if(t.length < 1)
            throw new Error("Default Not Set");
    } catch(exception){
        console.log("WARNING: DEPLOY_EXCLUDE_FILES is not set, or not set to an array. Values defaulted.");
        console.log('Enter a proper value in .deployment or as an ENV variable. e.g. [".git", ".deploy", ".idea", "node_modules", "dist"]');
        process.env.DEPLOY_EXCLUDE_FILES = '[".git", ".deploy", ".idea", "node_modules", "' + process.env.DEPLOY_DIST_FOLDER + '"]';
    }
}


/**
 * getFunctionFolders - Gets a list of all the folders that contain functions.
 * @returns {*|promise|h|*|promise|h}
 */
function getFunctionFolders(){
    console.log("Start getFunctionFolders");
    var deferred = q.defer();
    var topFolders = [];
    fs.readdir(process.env.DEPLOYMENT_SOURCE, function(err,files){
        if(err){
            deferred.reject({success : false, error : err});
        } else {
            var exclude_files = JSON.parse(process.env.DEPLOY_EXCLUDE_FILES);
            for(var i=0; i<files.length; i++){
                if( exclude_files.indexOf(files[i]) < 0 && fs.statSync(path.join(process.env.DEPLOYMENT_SOURCE, files[i])).isDirectory()) {
                    topFolders.push(files[i]);
                }
            }
            deferred.resolve({success : true, top_folders : topFolders });
        }
    });
    return deferred.promise;
}

/**
 * copyFiles - Copies Folders that are untouched to the "dist" folder.
 * @param folder - the folder that needs to be copied.
 * @returns {*|promise|h|*|promise|h} - Object with success/failure details.
 */
function copyFiles(folder){
    console.log("Start copyFiles");
    var deferred = q.defer();
    var fromDir = path.join(process.env.DEPLOYMENT_SOURCE, folder);
    var toDir = path.join(process.env.DEPLOYMENT_SOURCE, process.env.DEPLOY_DIST_FOLDER, folder);
    var exclude = JSON.parse(process.env.DEPLOY_EXCLUDE_FILES);
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
                deferred.resolve({success : true });
        });
    return deferred.promise;
}

function createDependencyFile(folder){
    console.log("Start createDependencyFile");
    const deferred = q.defer();
    const base = process.env.DEPLOYMENT_SOURCE;
    const index = path.join(base, folder, "index.js");

    fs.readFile(index, 'utf8', function (err,data) {
        if (err && err.code == 'ENOENT')
            deferred.reject({success : true, error : err });
        else if (err)
            deferred.reject({success : false, error : err });

        getPaths(index, data).then(resolvePaths).then(generateRequires).then(updateIndex).then(function(){
            deferred.resolve({success:true});
        }).done(function(){}, function(err){
            deferred.reject({success: false, "action":"createDependencyDone", "error": error });
        });
    });

    return deferred.promise;
}

/**
 * finalMove - Moves the files into the wwwroot folder.
 * @returns {*|promise|h|*|promise|h} - Resolve on success, reject on failure.
 */
function finalMove(){
    console.log("Start finalMove");
    const deferred = q.defer();
    var deploy_dir = path.normalize(process.env.DEPLOYMENT_SOURCE);
    var base = path.join(process.env.DEPLOYMENT_SOURCE, "..");
    console.log("Copying host.json");
    fs.copySync(path.join(deploy_dir, "host.json"), path.join(deploy_dir, process.env.DEPLOY_DIST_FOLDER, "host.json"));
    console.log("Moving wwwroot to wwwroot2");
    fs.rename(path.join(base, "wwwroot"), path.join(base, "wwwroot2"), function(err){
        if(err) {
            console.log("Error wwwroot copy:",JSON.stringify(err));
            deferred.reject({success : false, "error" : err});
        } else {
            console.log("Moving dist to wwwroot");
            fs.rename(path.join(deploy_dir, process.env.DEPLOY_DIST_FOLDER), path.join(base, "wwwroot"), function(err){
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


//*********************** HELPER FUNCTIONS ***************************

/**
 * getPaths - Give a file name, extracts all requires with path.join's that include variables.
 * @param file - The name of the file to search
 * @returns {*|promise|h|} - Object { FILE_PATTERN : {find : REQUIRE_STATEMENT, files: []}}
 */
function getPaths(file, data){
    var deferred = q.defer();
    var paths = {};
    const replace = {
        "__dirname" : "'" + path.dirname(file) + "'"
    };

    //Extract the normal requires without wildcards.
    var regex = /require\s*\(['"]([^'"]+)['"]\)/g;
    var match = regex.exec(data);

    //Grab/Store all standard libraries to remove duplicates
    while (match !== null) {
        paths[match[1]] = {}
        paths[match[1]].find =match[0];
        paths[match[1]].replace = "'" + match[1] + "'";
        paths[match[1]].files = [match[1]];

        match = regex.exec(data);
    }

    //Extract the WildCard requires
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
        paths[wildCardName] = {};
        paths[wildCardName].find = matchPathRequire[0];
        //Used to remove __dirname since later reference remove the baseDir from the naming
        var tmpReplace = matchPathRequire[1].split(",");
        (tmpReplace.indexOf("__dirname") >= 0) ? tmpReplace.splice(tmpReplace.indexOf("__dirname"),1) : "";
        paths[wildCardName].replace = tmpReplace.join("+ '\\" + path.sep + "' +");
        //Tack on . JS at the end, since wild-cards get evaluated to absolute files need it to match.
        paths[wildCardName].replace = (/\.js['"]/i.test(paths[wildCardName].replace)) ? paths[wildCardName].replace : paths[wildCardName].replace + " + '.js'";
        paths[wildCardName].files = [];
        matchPathRequire = regexPathRequire.exec(data);
    }
    deferred.resolve({success: true, index: file, paths :paths });

    return deferred.promise;
}

/**
 * resolvePaths - Takes a list of wildcard patterns and gets files that match that patterns.
 * @param wildCardPaths - Object of the format that getPaths returns e.g.  - Object { FILE_PATTERN : {find : REQUIRE_STATEMENT, files: []}}
 * @returns {*|promise|h} - Object { FILE_PATTERN : {find : REQUIRE_STATEMENT, files: [FILE_MATCH1, FILE_MATCH2]}} with files filled out
 */
function resolvePaths(pathResults){
    var deferred = q.defer();
    var promises = [];
    var paths = pathResults.paths;
    for (var filePath in paths) {
        if (!paths.hasOwnProperty(filePath)) continue;
        var normalPath = path.normalize(filePath);

        //If it doesn't have a *, its not a wildcard and doesn't need this process
        if(normalPath.indexOf("*") < 0)
            continue;

        var basePath = normalPath.substr(0, normalPath.indexOf("*"));
        var baseDir = basePath.substr(0, basePath.lastIndexOf(path.sep));

        promises.push(paths[filePath].promise = getFiles(baseDir, normalPath));
    }
    q.allSettled(promises).then(function(results){
        for (var filePath in paths) {
            if (!paths.hasOwnProperty(filePath)) continue;
            if(paths[filePath].promise) {//Since nonWildCard hasn't set this
                paths[filePath].files = paths[filePath].promise.valueOf();
                delete paths[filePath].promise;
            }
        }
        deferred.resolve({success: true, action: "resolvePaths", index: pathResults.index, paths: paths });
    }).catch(function(error){
        deferred.reject({ success : false, action: "resolvePaths", error: error });
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
 * generateRequires  - Takes the wildCardPaths output from resolvePaths and generates the JavaScript to include/reference files
 * @param wildCardPaths - Output format from resolvePaths - e.g. Object { FILE_PATTERN : {find : REQUIRE_STATEMENT, files: [FILE_MATCH1, FILE_MATCH2]}}
 * @returns {*|promise|h} - String - The JavaScript to create the includes.
 */
function generateRequires(pathResults){
    var deferred = q.defer();
    var functionBase = path.dirname(pathResults.index) + path.sep;
    var requires = "\tglobal.azureDeps = (global.azureDeps) ? global.azureDeps : {};\n";
    var paths = pathResults.paths;

    for (var pattern in paths) {
        var files = paths[pattern].files;
        for(var i = 0; i < files.length; i++){
            requires += '\tglobal.azureDeps["' + files[i].replace(functionBase, '').replace(/[\\]/g, '\\$&') + '"] =\trequire("' + files[i].replace(/[\\]/g, '\\$&') + '");\n';
        }
    }
    deferred.resolve(   {   success: true, action: "generateRequires", index: pathResults.index,
                            paths : paths, js : requires });
    return deferred.promise;
}

/**
 * updateIndex - Updates the copied index to point to the appropriate requiered files.
 * @param folder - The folder to get the index from
 * @returns {*|promise|h|*|promise|h} - Resolve on Success Reject on Failure
 */
function updateIndex(pathResults){
    console.log("Start updateIndex");
    const deferred = q.defer();
    const index = pathResults.index.split(path.sep).slice(0,-2).concat([process.env.DEPLOY_DIST_FOLDER], pathResults.index.split(path.sep).slice(-2)).join(path.sep);
    const depFile = path.join(path.dirname(pathResults.index), process.env.WEBPACK_OUTPUT_FILE);

    //Write the dependency file.
    fs.writeFile(depFile, pathResults.js, function(err){
        if(err)
            deferred.reject({success : false, action: "Write Dep File", file: depFile, error : err});

        //Read tye copied index file and start creating the new file.
        fs.readFile(index, 'utf8', function (err,data) {
            if (err)
                deferred.reject({success : false, error : err });

            //Update data to reference the new dependency structure
            for (var path in pathResults.paths) {
                if (!pathResults.paths.hasOwnProperty(path)) continue;
                var pathObj = pathResults.paths[path];
                //Escape the string, and then substitute regExPattern for ' or " to allow either to surround string
                var sReg = pathObj.find.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/['"]/g,"['\"]");
                data = data.replace(new RegExp(sReg, "g"), "global.azureDeps[" + pathObj.replace + "]");

            }

            //Add Require Dependency to top of the file.
            var useStrictRegex = /^\s*['"]use strict['"];/g;
            var useStrict = "'use strict';\n";
            var requireFile = "require('./" + process.env.WEBPACK_OUTPUT_FILE + "');\n";
            data = (useStrictRegex.test(data)) ? data.replace(useStrictRegex, useStrict + requireFile) : requireFile + data;

            //Write the new index file with the contents
            fs.writeFile(index, data, function(err){
                if (err)
                    deferred.reject({success : false, error : err });

                deferred.resolve({success : true});
            });
        });
    });
    return deferred.promise;
}
