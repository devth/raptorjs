raptor.defineClass(
    "optimizer.SimpleUrlBuilder",
    function(raptor) {
        "use strict";
        
        var SimpleUrlBuilder = function(config) {
            this.prefix = config.prefix;
            this.scriptsPrefix = config.scriptsPrefix;
            this.styleSheetsPrefix = config.styleSheetsPrefix;
        };
        
        SimpleUrlBuilder.prototype = {
            buildBundleUrl: function(bundle, checksum) {
                return this.getPrefix(bundle) + this.getBundleFilename(bundle, checksum);
            },
            
            getBundleFilename: function(bundle, checksum) {
                return bundle.getName() + "-" + checksum + "." + this.getFileExtension(bundle.getContentType());
            },
            
            getFileExtension: function(contentType) {
                if (contentType === 'application/javascript') {
                    return 'js';
                }
                else if (contentType === 'text/css') {
                    return 'css';
                }
                else {
                    raptor.throwError(new Error("Unsupported content type: " + contentType));
                }
            },
            
            getPrefix: function(bundle) {
                var prefix;
                
                if (bundle.isJavaScript()) {
                    prefix = this.scriptsPrefix || this.prefix;
                }
                else if (bundle.isStyleSheet()) {
                    prefix = this.styleSheetsPrefix || this.prefix;
                }
                else {
                    raptor.throwError(new Error("Invalid bundle content type: " + bundle.getContentType()));
                }
                return prefix;
            }
        };

        
        return SimpleUrlBuilder;
    });