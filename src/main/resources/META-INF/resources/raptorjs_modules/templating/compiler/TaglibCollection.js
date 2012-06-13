/*
 * Copyright 2011 eBay Software Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Merges a set of taglibs for ea
 */
raptor.defineClass(
    'templating.compiler.TaglibCollection',
    function(raptor) {
        "use strict";
        
        var forEach = raptor.forEach,
            extend = raptor.extend,
            strings = raptor.strings,
            Taglib = raptor.require("templating.compiler.Taglib"),
            ElementNode = raptor.require('templating.compiler.ElementNode'),
            TextNode = raptor.require('templating.compiler.TextNode'),
            Tag = Taglib.Tag,
            Transformer = Taglib.Transformer,
            /*
             * Probably one of the more amazing regular expressions you will ever see...
             * 
             * Valid imports:
             * x, y, z from http://raptor.ebayopensource.org/core
             * x, y, z from core
             * x, y, z from core as my-core
             * * from core as c 
             * core
             * core as my-core
             */
            importRegExp = /^(?:(\*|(?:(?:@?[A-Za-z0-9_\-]+\s*,\s*)*@?[A-Za-z0-9_\-]+))\s+from\s+)?([^ ]*)(?:\s+as\s+([A-Za-z0-9_\-]+))?$/,
            getImported = function(lookup, localName, imports) {
                if (lookup[localName] != null) {
                    return lookup[localName];
                }
                
                var prefixEnd = localName.indexOf('-'),
                    prefix,
                    uri,
                    name;
                
                
                
                if (prefixEnd != -1) {
                    
                    
                    prefix = localName.substring(0, prefixEnd);
                    name = localName.substring(prefixEnd+1);
                    
                    if (lookup['*-' + name]) {
                        uri = imports._prefixes[prefix];
                        
                        if (uri) {
                            return {
                                uri: uri,
                                name: name,
                                prefix: prefix
                            };
                        }
                    }
                }
                
                return null;
            };
        
        var Imports = function(taglibs, importsStr) {
            this._tagImports = {};
            this._attrImports = {};
            this._prefixes = {};
            
            var parts = strings.trim(importsStr).split(/\s*;\s*/);
            forEach(parts, function(part) {
                if (!part) { //Skip empty strings
                    return;
                }
                
                var match = part.match(importRegExp),
                    imports,
                    importsLookup = {},
                    from,
                    as;
                
                if (!match) {
                    raptor.throwError(new Error('Invalid import: "' + part + '"'));
                }
                else {
                    imports = match[1],
                    from = taglibs.resolveURI(match[2]),
                    as = match[3];

                    if (!imports) {
                        imports = "*";
                    }
                    if (!as) {
                        as = taglibs.resolvePrefix(from) || taglibs.resolveShortName(from); //Use either the prefix (preferred) or the short name if provided
                        if (!as) {
                            raptor.throwError(new Error('Unable to handle imports from "' + from + '". The taglib does not have a prefix or short name defined.'));
                        }
                    }
                }
                
                this._prefixes[as] = from;
                
                forEach(imports.split(/\s*,\s*/), function(importedTagName) {
                    importsLookup[importedTagName] = true;
                });

                taglibs.forEachTag(from, function(tag, taglib) {
                    
                    if (tag.uri === from) {
                        /*
                         * Import tags with a URI that matches the taglib URI
                         */
                        if (importsLookup['*'] || importsLookup[tag.name]) {
                            this._tagImports[as + '-' + tag.name] = { uri: from, name: tag.name, prefix: as };
                        }
                    }
                    else if (tag.uri === '*' && tag.name !== '*') {
                        this._tagImports['*-' + tag.name] = { uri: '*', name: tag.name };
                    }
                    
                    /*
                     * Allow imports for attributes that can be assigned to tags with a different URI
                     * e.g. <div c-if="someCondition"></div> --> <div c:if="someCondition"></div>
                     */
                    tag.forEachAttribute(function(attr) {
                        
                        if (importsLookup['*'] || importsLookup["@" + attr.name]) {
                            if (attr.uri === '*' && attr.name !== '*') {
                                this._attrImports['*-' + attr.name] = { uri: '*', name: attr.name };
                            }
                            else if (tag.uri !== from) {
                                this._attrImports[as + '-' + attr.name] = { uri: from, name: attr.name, prefix: as };  
                            }
                        }
                        
                    }, this);
                    
                }, this);
                
            }, this);
        };
        
        Imports.prototype = {

            getImportedTag: function(localName) {
                return getImported(this._tagImports, localName, this);
            },
            
            getImportedAttribute: function(localName) {
                return getImported(this._attrImports, localName, this);
            }
        };
        
        
        var TaglibCollection = function() {
            this.tagTransformersLookup = {}; //Tag transformers lookup
            this.tagDefs = {}; //Tag definitions lookup
            this.textTransformers = [];
            this.taglibs = [];
            this.taglibsByURI = {}; //Lookup to track the URIs of taglibs that have been added to this collection
            this.shortNameToUriMapping = {};
            this.uriToShortNameMapping = {};
            this.uriToPrefixMapping = {};
            this.functionsLookup = {};
            
        };
        
        TaglibCollection.prototype = {
            forEachTag: function(uri, callback, thisObj) {
                uri = this.resolveURI(uri);
                
                
                var taglib = this.taglibsByURI[uri];
                
                
                if (!taglib) {
                    return;
                }
                
                forEach(taglib.tags, function(tag) {
                    
                    callback.call(thisObj, tag, taglib);
                });
            },
            
            /**
             * Checks if the provided URI is the URI of a taglib
             * 
             * @param uri {String} The URI to check
             * @returns {Boolean} Returns true if the URI is that of a taglib. False, otherwise.
             */
            isTaglib: function(uri) {
                return this.taglibsByURI[uri] != null;
            },
            
            /**
             * Adds a new taglib to the collection
             * 
             * @param taglib {templating.compiler$Taglib} The taglib to add
             */
            add: function(taglib) {
                taglib = extend(new Taglib(), taglib); //Convert the tag to an actual Tag class
                if (taglib.tags) {
                    taglib.tags = [].concat(taglib.tags);
                }
                
                if (this.taglibsByURI[taglib.uri]) { //Check if a taglib with the same URI has already been added
                    return; //Taglib already added... nothing to do
                }
                this.taglibs.push(taglib);
                this.taglibsByURI[taglib.uri] = taglib; //Mark the taglib as added
                
                if (taglib.shortName) {
                    /*
                     * If the taglib has a short name then record that mapping so that we
                     * can map the short name to the full URI
                     */
                    this.taglibsByURI[taglib.shortName] = taglib; //Mark the short name as being a taglib
                    
                    if (taglib.shortName) {
                        this.shortNameToUriMapping[taglib.shortName] = taglib.uri; //Add the mapping
                        this.uriToShortNameMapping[taglib.uri] = taglib.shortName; //Add the reverse-mapping
                    }
                    
                    if (taglib.prefix) {
                        this.uriToPrefixMapping[taglib.uri] = taglib.prefix;
                    }
                }
                
                /*
                 * Index all of the tags in the taglib by registering them
                 * based on the tag URI and the tag name
                 */
                forEach(taglib.tags, function(tag, i) {
                    
                    var uri = tag.uri == null ? taglib.uri : tag.uri, //If not specified, the tag URI should be the same as the taglib URI
                        name = tag.name,
                        key = uri + ":" + name; //The taglib will be registered using the combination of URI and tag name
                    /*
                     * NOTE: Wildcards are supported for URI and tag name. The tag URI can be a asterisk to indicate 
                     *       that it matches any URI and similar for the tag name. 
                     */
                    
                    tag = taglib.tags[i] = extend(new Tag(), tag); //Convert the tag to an actual Tag class
                    tag.taglib = taglib; //Store a reference to the taglib that the tag belongs to
                    tag.uri = uri;
                    
                    this.tagDefs[key] = tag; //Register the tag using the combination of URI and tag name so that it can easily be looked up
                    
                    if (tag.transformers) { //Check if the tag has any transformers that should be applied
                        
                        var tagTransformersEntry; //A reference to the array of the tag transformers with the same key
                        
                        if (!(tagTransformersEntry = this.tagTransformersLookup[key])) { //Look up the existing transformers
                            this.tagTransformersLookup[key] = tagTransformersEntry = { //No transformers found so create a new entry
                                    transformers: [], //Initialize the transformers to an empty list
                                    before: {}, //This map will contain entries for transformers that should be invoked after a transformer of a certain class name (class names are keys)
                                    after: {}, //This map will contain entries for transformers that should be invoked before a transformer of a certain class name (class names are keys)
                                    _addRelativeTransformer: function(beforeAfter, transformer, relativeTo) {
                                        var existing = this[beforeAfter][relativeTo]; //There may be more than one transformer configured to be invoked before another transformer
                                        if (!existing) { 
                                            existing = this[beforeAfter][relativeTo] = [];
                                        }
                                        existing.push(transformer);
                                    }
                            };
                        }
                        
                        //Now add all of the transformers for the node (there will typically only be one...)
                        forEach(tag.transformers, function(transformer) {
                            
                            transformer = extend(new Transformer(), transformer); //Convert the transformer config to instance of Transformer
                            
                            if (transformer.after) { //Check if this transformer is configured to run after another transfrormer
                                tagTransformersEntry._addRelativeTransformer("after", transformer, transformer.after);
                            }
                            else if (transformer.before) { //Check if this transformer is configured to run after another transfrormer
                                tagTransformersEntry._addRelativeTransformer("before", transformer, transformer.before);
                            }
                            else {
                                tagTransformersEntry.transformers.push(transformer);  //The transformer is not configured to run before/after another transformer so just append it to the list                             
                            }
                            
                        }, this);
                    }
                    
                    
                }, this);
                
                /*
                 * Now register all of the text transformers that are part of the provided taglibs
                 */
                forEach(taglib.textTransformers, function(textTransformer) {
                    this.textTransformers.push(extend(new Transformer(), textTransformer));
                }, this);
                
                
                
                forEach(taglib.functions, function(func) {
                    if (!func.name) {
                        return;
                    }
                    this.functionsLookup[taglib.uri + ":" + func.name] = func;
                    if (taglib.shortName) {
                        this.functionsLookup[taglib.shortName + ":" + func.name] = func;
                    }
                }, this);
                
                
            },
            
            /**
             * Invokes a callback for eaching matching transformer that is found for the current node.
             * If the provided node is an element node then the match is based on the node's
             * URI and the local name. If the provided node is a text node then all
             * text transformers will match.
             * 
             * @param node {templating.compiler$Node} The node to match transformers to
             * @param callback {Function} The callback function to invoke for each matching transformer
             * @param thisObj {Object} The "this" object to use when invoking the callback function
             */
            forEachNodeTransformer: function(node, callback, thisObj) {
                /*
                 * Based on the type of node we have to choose how to transform it
                 */
                if (node instanceof ElementNode) {
                    this.forEachTagTransformer(node.uri, node.localName, callback, thisObj);
                }
                else if (node instanceof TextNode) {
                    this.forEachTextTransformer(callback, thisObj);
                }
            },
            
            /**
             * Resolves a taglib short name to a taglib URI.
             * 
             * <p>
             * If the provided short name is not a known short name then it is just returned.
             * 
             * @param shortName {String} The taglib short name to resolve
             * @returns {String} The resolved URI or the input string if it is not a known short name
             */
            resolveURI: function(shortName) {
                if (!shortName) {
                    return shortName;
                }
                return this.shortNameToUriMapping[shortName] || shortName;
            },
            
            /**
             * Resolves a taglib URI to a taglib short name.
             * 
             * <p>
             * If the provided URI is not a known short name then it is just returned.
             * 
             * @param uri {String} The taglib uri to resolve to a short name
             * @returns {String} The resolved short name or undefined if the taglib does not have a short name
             */
            resolveShortName: function(uri) {
                if (!uri) {
                    return uri;
                }
                if (this.shortNameToUriMapping[uri]) { //See if the URI is already a short name
                    return uri;
                }
                
                return this.uriToShortNameMapping[uri]; //Otherwise lookup the short name for the long URI
            },
            
            resolvePrefix: function(uri) {
                if (!uri) {
                    return uri;
                }
                uri = this.resolveURI(uri); //Resolve the short name to a long URI
                
                return this.uriToPrefixMapping[uri]; //See if there is a mapping from the long URI to a prefix
            },
            
            /**
             * Invokes a provided callback for each tag transformer that
             * matches the provided URI and tag name.
             * 
             * @param uri {String} The tag URI or an empty string if the tag is not namespaced
             * @param tagName {String} The local name of the tag (e.g. "div")
             * @param callback {Function} The callback function to invoke
             * @param thisObj {Object} The "this" object to use when invoking the callback function
             */
            forEachTagTransformer: function(uri, tagName, callback, thisObj) {
                /*
                 * If the node is an element node then we need to find all matching
                 * transformers based on the URI and the local name of the element.
                 */
                
                if (uri == null) {
                    uri = '';
                }
                
                /*
                 * Handle all of the transformers in the tag transformers entry
                 */
                var _handleTransformers = function(entry, transformers) {
                        if (!entry) { //If no entry then nothing to do
                            return;
                        }
                        
                        if (!transformers) {
                            transformers = entry.transformers; //If no transformers were provided then using the transformers in the entry
                        }
                        
                        if (!transformers) { //Check if there are any transformers
                            return;
                        }
                        /*
                         * Loop over all of the transformers and invoke the provided callback
                         */
                        for (var i=0, len=transformers.length; i<len; i++)
                        {
                            var transformer = transformers[i];
                            
                            if (entry.before[transformer.className]) {
                                _handleTransformers(entry, entry.before[transformer.className]); //Handle any transformers that are registered to be invoked before the current transformer
                            }
                            
                            if (callback.call(thisObj, transformer) === false) { //Invoke the callback and if the return value is "false" then stop
                                return;
                            }

                            if (entry.after[transformer.className]) {
                                _handleTransformers(entry, entry.after[transformer.className]); //Handle any transformers that are registered to be invoked after the current transformer 
                            }
                        }
                    };
                
                /*
                 * Handle all of the transformers for all possible matching transformers.
                 * 
                 * Start with the most specific and end with the list specific.
                 */
                _handleTransformers(this.tagTransformersLookup[uri + ":" + tagName]); //All transformers that match the URI and tag name exactly
                _handleTransformers(this.tagTransformersLookup[uri + ":*"]); //Wildcard for tag name but matching URI (i.e. transformers that apply to every element with a URI, regadless of tag name)
                _handleTransformers(this.tagTransformersLookup["*:*"]); //Wildcard for both URI and tag name (i.e. transformers that apply to every element)
            },
            
            /**
             * Invokes a provided callback for each registered text transformer.
             * 
             * @param callback {Function} The callback function to invoke
             * @param thisObj {Object} The "this" object to use when invoking the callback function
             */
            forEachTextTransformer: function(callback, thisObj) {
                forEach(this.textTransformers, function(textTransformer) {
                    var keepGoing = callback.call(thisObj, textTransformer);
                    if (keepGoing === false) {
                        return false;
                    }
                    return true;
                });
            },
            
            /**
             * Returns the definition of a tag that was loaded from the taglib with the specified
             * URI and with the matching 
             * @param uri
             * @param localName
             * @returns
             */
            getTagDef: function(uri, localName) {
                var tagDef = this.tagDefs[uri + ":" + localName];
                if (!tagDef) {
                    tagDef = this.tagDefs[uri + ":*"]; //See if there was a wildcard tag definition in the taglib
                }
                return tagDef;
            },
            
            getFunction: function(uri, functionName) {
                return this.functionsLookup[uri + ":" + functionName];
            },
            
            getImports: function(importsStr) {
                return new Imports(this, importsStr);
            }
        };
        
        return TaglibCollection;
    });