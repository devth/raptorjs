raptor.defineClass(
    "raptorjs-packager.BundlesWriter",
    function() {
        var walker = raptor.require('resources.walker'),
            BundleConfig = raptor.require("raptorjs-packager.BundleConfig"),
            packaging = raptor.require("packaging"),
            files = raptor.require('files'),
            forEach = raptor.forEach,
            forEachEntry = raptor.forEachEntry;
        
        var BundlesWriter = function(options) {
            this.options = options;
            this.bundleConfig = new BundleConfig(options);
            if (options.bundles) {
                this.bundleConfig.addBundles(options.bundles);
            }
            
            this.bundlesDir = options.bundlesDir;
            this.pagesDir = options.pagesDir;
            this.enabledExtensions = options.enabledExtensions;
            this.usePackageBundles = options.usePackageBundles !== false;
            
            if (this.usePackageBundles) {
                this.createPackageBundles();
            }
            
            this.pages = options.pages;
        };
        
        BundlesWriter.prototype = {
            writeBundles: function() {
                
                this.bundleConfig.forEachBundle(function(bundle) {    
                    this.writeBundle(bundle);
                }, this);
                
                this.writePages();
            },
            
            createPackageBundles: function() {
                
                
                var found = {},
                    createBundleForPackage = function(manifest) {
                        if (found[manifest.getSystemPath()]) {
                            return;
                        }
                        
                        found[manifest.getSystemPath()] = true;
                        
                        var resourceIncludes = [],
                            bundleName = (manifest.type || "module") + "-" + manifest.name;
                        
                        this.logger().info('Creating bundle "' + bundleName + '" for package "' + manifest.getSystemPath() + '"');
                        
                        var bundle = this.bundleConfig.createBundle(bundleName);
                        manifest.forEachInclude({
                            callback: function(type, include) {
                                var handler = packaging.getIncludeHandler(type);
                                if (handler.isPackageInclude(include)) {
                                    createBundleForPackage.call(this, handler.getManifest(include));
                                }
                                else {
                                    bundle.addInclude(include, manifest);
                                }
                            },
                            enabledExtensions: this.enabledExtensions,
                            thisObj: this
                        });
                    };
                
                //Now write the rest of the packages
                walker.walk(
                        "/", 
                        function(packageJsonResource) {
                            var manifest = packaging.getPackageManifest(packageJsonResource);
                            createBundleForPackage.call(this, manifest);
                        }, 
                        this, 
                        {
                            resourceFilter : function(resource) {
                                return resource.isFile()
                                    && resource.getName() == "package.json";
                            },
                            dirTraverseFilter : function(dir) {
                                if (dir.getName() === "node_modules") {
                                    return false;
                                }
                            }
                        });
            },
            
            writeBundle: function(bundle) {
                bundle.writeBundle(this.bundlesDir, this.options);
            },
            
            writePages: function() {
                
                forEachEntry(this.pages, function(pageName, pageConfig) {
                    var pageBundleConfig = this.bundleConfig.clone();
                    
                    /*
                     * Create the page bundle...
                     */
                    if (!pageConfig.includes) {
                        pageConfig.includes = [];
                    }
                    
                    if (pageConfig.asyncIncludes && pageConfig.asyncIncludes.length) {
                        //Make sure the loader module is included if there are any async includes
                        pageConfig.includes.push({type: "module", name: "loader"});
                    }
                    
                    var pageBundle = pageBundleConfig.addBundle("page-" + pageName, pageConfig.includes, true);
                    this.writeBundle(pageBundle); //Write out the page bundle
                    
                    var urls = pageBundleConfig.getUrls(pageConfig.includes);
                    
                    var asyncMetadata = null;
                    
                    if (pageConfig.asyncIncludes) {
                        var asyncPageBundle = pageBundleConfig.addBundle("page-" + pageName + "-async", pageConfig.asyncIncludes, true);
                        this.writeBundle(asyncPageBundle); //Write out the async page bundle
                        
                        asyncMetadata = pageBundleConfig.getAsyncMetadata(pageConfig.asyncIncludes, {
                            excludeUrls: urls //Exclude page URLs
                        });
                    }
                    
                    this.writeHeadHTML(pageName, urls.css);
                    this.writeBodyHTML(pageName, urls.js, asyncMetadata);

                }, this);
            },
            
            writeHeadHTML: function(pageName, cssUrls) {
                if (!cssUrls || !cssUrls.length) {
                    return;
                }
                
                var outputFile = new files.File(this.pagesDir, pageName + "-head.html");
                var links = [];
                forEach(cssUrls, function(url) {
                    links.push('<link rel="stylesheet" type="text/css" href="' + url + '" />');
                }, this);
                
                outputFile.writeFully(links.join("\n"));
            },
            
            writeBodyHTML: function(pageName, jsUrls, asyncMetadata) {
                var outputFile = new files.File(this.pagesDir, pageName + "-body.html");
                var output = [],
                    scripts = [];
                if (jsUrls && jsUrls.length) {
                    forEach(jsUrls, function(url, i) {
                        scripts.push('<script type="text/javascript" src="' + url + '"' + (i !== 0 ? ' async="true"' : '') + '></script>');
                    }, this);
                    
                    output.push(scripts.join("\n"));
                }
                
                if (asyncMetadata) {
                    output.push('<script type="text/javascript">_asyncModules=' + JSON.stringify(asyncMetadata) + '</script>');
                }
                
                if (output.length) {
                    outputFile.writeFully(output.join("\n"));
                }
            }
        };
        
        return BundlesWriter;
    });