$rload(function(raptor) {
    
    
    var nodePath = require("path"),
        nodeFS = require("fs");
        
    var File = function(path) {
        if (arguments.length === 1) {
            this._path = path;    
        }
        else if (arguments.length === 2) {
            var parentFile = arguments[0],                
                childPath = arguments[1],
                parentPath;
            
            if (parentFile instanceof File) {
                parentPath = parent.getAbsolutePath();
            }
            else {
                parentPath = '' + parentFile;
            }
            
            this._path = nodePath.join(parentPath, childPath);
        }
        
        this._stat = null;
    };
    
    File.prototype = {
        _getStat: function() {
            try
            {
                return nodeFS.statSync(this._path);
            }
            catch(e) {
                return null;
            }
        },
        
        exists: function() {
            return nodePath.existsSync(this._path);
        },
        
        isDirectory: function() {
            var stat = this._getStat();
            return stat && stat.isDirectory();
        },
        
        isFile: function() {
            var stat = this._getStat();
            return stat && stat.isFile();
        },
        
        isSymbolicLink: function() {
            var stat = this._getStat();
            return stat && stat.isSymbolicLink();
        },
        
        getAbsolutePath: function() {
            return this._path;
        },
        
        getName: function() {
            return nodePath.basename(this._path);
        },
        
        getParent: function() {
            return nodePath.dirname(this._path);
        },
        
        getParentFile: function() {
            var parentPath = nodePath.dirname(this._path);
            
            return parentPath ? new File(parentPath) : null;
        },
        
        toString: function() {
            return this.getAbsolutePath();
        },
        
        readSymbolicLink: function() {
            var linkPath = nodeFS.readLinkSync(this._path);
            var path = nodePath.resolve(this.getParent(), linkPath);
            return new File(path);
        },
        
        listFiles: function() {
            var path = this._path;
            
            if (!nodePath.existsSync(path)) {
                raptor.throwError(new Error("File does not exist: " + path));
            }
            
            
            if (this.isSymbolicLink()) {
                this.readSymbolicLink().listFiles();
                return;
            }
            
            var filenames = nodeFS.readdirSync(this._path);
            var files = new Array(filenames.length);
            
            for (var i=0, len=filenames.length; i<len; i++) {
                files[i] = new File(nodePath.join(this._path, filenames[i]));
            }
            
            return files;
        },
        
        forEachFile: function(callback, thisObj) {
            var files = this.listFiles();
            
            for (var i=0, len=files.length; i<len; i++) {
                callback.call(thisObj, files[i]);
            }
        },
        
        mkdir: function() {
            nodeFS.mkdirSync(this.getAbsolutePath());
        },
        
        mkdirs: function() {
            var file = this, 
                missing = [];
            
            while ((parentFile = file.getParentFile())) {
                if (parentFile.exists()) {
                    break;
                }
                else {
                    missing.push(parentFile);
                    file = file.getParentFile();
                }
            }
            
            for (var i=missing.length-1; i>=0; i--) {
                missing[i].mkdir();
            }
        },
        
        writeFully: function(str, encoding) {
            if (this.isSymbolicLink()) {
                this.readSymbolicLink().writeFully(str, encoding);
                return;
            }
            
            this.mkdirs();
            
            nodeFS.writeFileSync(this.getAbsolutePath(), str, encoding || "UTF-8");
        },
        
        readFully: function(encoding) {
            if (this.isSymbolicLink()) {
                this.readSymbolicLink().readFully(encoding);
                return;
            }
            
            return nodeFS.readFileSync(this.getAbsolutePath(), encoding || "UTF-8");
        },
        
        remove: function() {
            if (!this.exists()) {
                raptor.throwError(new Error("Unable to delete file. File does not exist: " + this.getAbsolutePath()));
            }
            if (this.isSymbolicLink()) {
                nodeFS.unlinkSync(this.getAbsolutePath());
            }
            else if (this.isDirectory()) {
                //Delete all children
                this.forEachFile(function(child) {
                    child.remove();
                }, this);
                
                nodeFS.rmdirSync(this.getAbsolutePath());
            }
            else if (this.isFile()) {
                nodeFS.unlinkSync(this.getAbsolutePath());
            }
        },
        
        getExtension: function() {
            var filename = this.getName();
            var lastDot = filename.lastIndexOf('.');
            if (lastDot == 0) {
                return "";
            }
            return lastDot === -1 ? "" : filename.substring(lastDot+1); 
        }
    };
    
    raptor.files.File = File;
});