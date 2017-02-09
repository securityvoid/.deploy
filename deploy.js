'use strict';
const lib = require('./lib');
const webpack = require("webpack");
const q = require("q");
const fs = require('fs-extra');
const path = require('path');
const config = {
    exclude_dir : (process.env.EXCLUDE_DIR) ? JSON.parse(process.env.EXCLUDE_DIR) : [".git", ".deploy", ".idea", "node_modules", "dist"],
    outputFile : (process.env.outputFile) ? process.env.outputFile : "azure.deps.js"
}

createDistribution(config).then(function(results){
    console.log(JSON.stringify(results));
    lib.finalMove(config).then(function(result){
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
    lib.getFunctionFolders(config).then(function(results){
        var top_folders = results.top_folders;
        for(var x = 0; x < top_folders.length; x++){
            console.log("Start Folder:", top_folders[x]);
            (function(x){
                creationResults.push(lib.copyFiles(config, top_folders[x]).then(function(){
                    return lib.createDependencyFile(config, top_folders[x]).then(function(){
                        return webPackIt(config, top_folders[x]);
                    });
                }).then(function(){
                    return lib.updateIndex(config, top_folders[x]);
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

function webPackIt(config, folder){
    console.log("Start createDependencyFile");
    const deferred = q.defer();
    const base = process.env.DEPLOYMENT_SOURCE;
    const index = path.join(base, folder, "index.js");
    const outputDir = path.join(base, "dist", folder);
    console.log("index:" + index, "outputDir:", outputDir);

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

    return deferred.promise;
}