'use strict';
const webpack = require("webpack");
const fs = require('fs-extra');
const path = require('path');
const q = require("q");
const exclude = ['dist', "node_modules", "deploy.js", ".idea", 'makeMaster.js', 'package.json'];
const exec = require('child_process').exec;

copyFiles().then(setBranchMaster).then(webPackIt).then(gitAddCommit).then(function(results){
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

function setBranchMaster(){
    var deferred = q.defer();
    exec('git checkout master', {cwd: path.join(__dirname, "dist")}, function(error, stdout, stderr){
        if (error) {
            deferred.reject({success : false, error : error, stdout: stdout, stderr : stderr })
        }
        deferred.resolve({success : true, error : error, stdout: stdout, stderr : stderr })
    });
    return deferred.promise;
}

function gitAddCommit(){
    var deferred = q.defer();
    exec('git add .', {cwd: path.join(__dirname, "dist")}, function(error, stdout, stderr){
        if (error) {
            deferred.reject({success : false, error : error, stdout: stdout, stderr : stderr })
        }
        exec('git commit --message="Build Master:' + new Date().toISOString() + '"',
            {cwd: path.join(__dirname, "dist")}, function(error2, stdout2, stderr2){
            if (error) {
                deferred.reject({success : false, error : error2, stdout: stdout2, stderr : stderr2 })
            }
            exec('git push', {cwd: path.join(__dirname, "dist")}, function(error3, stdout3, stderr3){
                    if (error) {
                        deferred.reject({success : false, error : error3, stdout: stdout3, stderr : stderr3 })
                    }
                    deferred.resolve({success : true, error : error3, stdout: stdout3, stderr : stderr3 })
                });
        });
    });
    return deferred.promise;
}