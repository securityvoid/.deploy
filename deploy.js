'use strict';
const webpack = require("webpack");
const q = require("q");
const fs = require('fs-extra');
const path = require('path');
const rl = require('readline');
const config = {
    exclude_dir : (process.env.EXCLUDE_DIR) ? JSON.parse(process.env.EXCLUDE_DIR) : [".git", ".deploy", ".idea", "node_modules", "dist"],
    outputFile : (process.env.outputFile) ? process.env.outputFile : "azure.deps.js"
}


createDistribution(config).then(function(results){
    console.log(JSON.stringify(results));
    finalMove(config).then(function(result){
        console.log("SUCCESS!");
    }), function(err){
        console.log("FAILURE!");
        console.log(JSON.stringify(err));
    };
}).catch(function(error){
    console.log("ERROR!");
    console.log(JSON.stringify(error));
});


///**************************  FUNCTIONS ***************************** */

function createDistribution(config){
    console.log("Start: createDistribution");
    var deferred = q.defer();
    var creationResults = [];
    fs.removeSync(path.join(process.env.DEPLOYMENT_SOURCE, "dist"));
    getFunctionFolders(config).then(function(results){
        var top_folders = results.top_folders;
        for(var x = 0; x < top_folders.length; x++){
            console.log("Start Folder:", top_folders[x]);
            (function(x){
                creationResults.push(copyFiles(config, top_folders[x]).then(function(){
                    return createDependencyFile(config, top_folders[x]);
                }).then(function(){
                    return updateIndex(config, top_folders[x]);
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
            deferred.resolve(results);
        });
    });
    return deferred.promise;
}

function getFunctionFolders(config){
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

function copyFiles(config, folder){
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

function createDependencyFile(config, folder){
    console.log("Start createDependencyFile");
    const deferred = q.defer();
    const base = process.env.DEPLOYMENT_SOURCE;
    const index = path.join(base, folder, "index.js");
    const outputDir = path.join(base, "dist", folder);
    console.log("index:" + index, "outputDir:", outputDir);

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

        var jsContents = "'use strict'\n\tazure.deps = {\n";
        for (var key in libraries) {
            if (libraries.hasOwnProperty(key)) {
                jsContents += "\t\t" + cleanLibraryName(key) + " : " + libraries[key] + ",\n";
            }
        }

        jsContents = jsContents.slice(0, -2) + "\n\t};";
        fs.writeFileSync(path.join(folder, config.outputFile), jsContents);

        console.log("Running Webpack...");
        console.log("base:" + base, "folder:" + folder, "outFile:" + config.outputFile, "outputDir:" + outputDir);
        var compiler = webpack({
            entry: path.join(base, folder, config.outputFile),
            target: 'node',
            output : {
                path : outputDir,
                filename : config.outputFile
            },
            node: {
                __filename: false,
                __dirname: false
            },
            plugins: [
                new webpack.optimize.UglifyJsPlugin({
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
                fs.unlinkSync(path.join(base, folder, config.outputFile));
            } catch (error){
                if(error.code !== "ENOENT")
                    err = error;
            }
            if(err){
                console.log("Full Error");
                console.log(JSON.stringify(err));
                deferred.reject({success: false, error : err});
            }
            console.log("WebPack status...");
            var jsonStats = stats.toJson();
            if(jsonStats.errors.length > 0){
                console.log("JSonStats:")
                console.log(JSON.stringify(jsonStats));
                deferred.reject({success: false, error : jsonStats.errors});
            }
            if(jsonStats.warnings.length > 0)
                deferred.resolve({success : true, config: config, warnings : jsonStats.warnings});
            deferred.resolve({success : true, config: config});
        });
    });

    return deferred.promise;
}

function cleanLibraryName(name){
    return name.replace(/[^a-zA-Z0-9]/g, '');
}

function updateIndex(config, folder){
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
            return "azure.deps." + cleanLibraryName($1);
        }) + "\n";
        jsContents += line + after;
    }).on('close', function(){
        fs.writeFileSync(index, jsContents);
        deferred.resolve({success : true});
    });

    return deferred.promise;
}

function finalMove(config){
    console.log("Start finalMove");
    const deferred = q.defer();
    var deploy_dir = path.normalize(process.env.DEPLOYMENT_SOURCE);
    var base = path.join(process.env.DEPLOYMENT_SOURCE, "..");
    console.log("Copying host.json");
    fs.copySync(path.join(deploy_dir, "host.json"), path.join(deploy_dir, "dist", "host.json"));
    console.log("Moving wwwroot to wwwroot2");
    fs.move(path.join(base, "wwwroot"), path.join(base, "wwwroot2"), function(err){
        if(err) {
            console.log("Error wwwroot copy:",JSON.stringify(err));
            deferred.reject({success : false, "error" : err});
        } else {
            console.log("Moving dist to wwwroot");
            fs.move(path.join(deploy_dir, "dist"), path.join(base, "wwwroot"), function(err){
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