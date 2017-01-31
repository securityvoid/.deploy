'use strict';
const webpack = require("webpack");
const fs = require('fs-extra');
const path = require('path');
const q = require("q");
const exclude = ['dist', "node_modules", "deploy.js", ".idea", 'makeMaster.js', 'package.json'];

copyFiles().then(webPackIt).then(commitMaster).then(function(results){
    console.log("Success!");
}).catch(function(err){
    console.log("Failed!");
    console.log(JSON.stringify(err));
});

function webPackIt(){
    var deferred = q.defer();

    var compiler = webpack({
        entry: path.join(__dirname, "deploy.js"),
        target: 'node',
        output : {
            path : path.join(__dirname, "dist"),
            filename : "deploy.js"
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
        if(err)
            deferred.reject({success: false, error : err});
        var jsonStats = stats.toJson();
        if(jsonStats.errors.length > 0)
            deferred.reject({success: false, error : jsonStats.errors});
        if(jsonStats.warnings.length > 0)
            deferred.resolve({success : true, warnings : jsonStats.warnings});
        deferred.resolve({success : true});
    });

    return deferred.promise;
}

function copyFiles(){
    var deferred = q.defer();
    var dist = path.join(__dirname, "dist");
    fs.removeSync(dist);
    fs.ensureDir(dist, function (err) {
        if(err){
            deferred.reject({success : false, error : err});
        } else {
            fs.copy(__dirname, dist, function(file){
                for(var i = 0; i < exclude.length; i++){
                    var targetFile = path.normalize(file);
                    var filter = path.join(__dirname, exclude[i]);
                    if(targetFile.startsWith(filter))
                        return false;
                }
                return true;
            }, function (err) {
                if (err)
                    deferred.reject({success : false, error : err});
                else {
                    deferred.resolve({success : true});
                }
            })
        }
    })
    return deferred.promise;
}

function commitMaster(){
    var deferred = q.defer();
    deferred.resolve({success : true});
    return deferred.promise;
}