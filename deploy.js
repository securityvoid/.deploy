'use strict';
const lib = require('./lib');
const webpack = require("webpack");
const q = require("q");
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config({path: path.join(process.env.DEPLOYMENT_SOURCE, '.deployment') });

return createDistribution().then(function(results){
    return lib.finalMove().then(function(result){
        console.log("SUCCESS!");
        process.exit(0);
    }), function(err){
        console.log("FAILURE!");
        console.log(JSON.stringify(err));
        process.exit(1);
    };
}).catch(function(error){
    console.log("ERROR!");
    console.log(JSON.stringify(error));
    process.exit(1);
});


///**************************  FUNCTIONS ***************************** */

function createDistribution(){
    console.log("Start: createDistribution");
    var deferred = q.defer();
    var creationResults = [];
    lib.checkEnvVariables();
    fs.removeSync(path.join(process.env.DEPLOYMENT_SOURCE, process.env.DEPLOY_DIST_FOLDER));
    lib.getFunctionFolders().then(function(results){
        var top_folders = results.top_folders;
        for(var x = 0; x < top_folders.length; x++){
            console.log("Start Folder:", top_folders[x]);
            (function(x){
                creationResults.push(lib.copyFiles(top_folders[x]).then(function(){
                    return lib.createDependencyFile(top_folders[x]).then(function(){
                        return webPackIt(top_folders[x]);
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
            deferred.resolve(results);
        });
    });
    return deferred.promise;
}

function webPackIt(folder){
    console.log("Start createDependencyFile");
    const deferred = q.defer();
    const base = process.env.DEPLOYMENT_SOURCE;
    const index = path.join(base, folder, "index.js");
    const outputDir = path.join(base, process.env.DEPLOY_DIST_FOLDER, folder);
    console.log("index:" + index, "outputDir:", outputDir);

    console.log("Running Webpack...");
    console.log("base:" + base, "folder:" + folder, "outFile:" + process.env.WEBPACK_OUTPUT_FILE, "outputDir:" + outputDir);
    var compiler = webpack({
        entry: path.join(base, folder, process.env.WEBPACK_OUTPUT_FILE),
        target: 'node',
        output : {
            path : outputDir,
            filename : process.env.WEBPACK_OUTPUT_FILE
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