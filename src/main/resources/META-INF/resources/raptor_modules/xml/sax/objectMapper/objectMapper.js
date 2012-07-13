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

raptor.define(
    'xml.sax.objectMapper',
    function(raptor) {
        "use strict";
        
        var forEach = raptor.forEach,
            sax = raptor.require("xml.sax"),
            forEachEntry = raptor.forEachEntry,
            arrays = raptor.require("arrays"),
            strings = raptor.require("strings"),
            STRING = "string",
            BOOLEAN = "boolean",
            OBJECT = "object";
        
        return {
            
            read: function(xmlSrc, filePath, schema, options) {
                
                if (!options) {
                    options = {};
                }
                
                var typeStack = [],
                    objStack = [],
                    rootObj = null,
                    curType = schema,
                    curProp = null,
                    curObj = null,
                    curText = null,
                    saxParser = sax.parser({
                        trim: true,
                        normalize: true
                    }),
                    trimText = options.trimText !== false;
                
                var _handleError = function(message) {
                    raptor.throwError(new Error(message + " (" + saxParser.getPos() + ")")); 
                };
                
                var _setProp = function(name, type, t) {
                    if (trimText && t) {
                        t = strings.trim(t);
                    }
                    
                    if (name) {
                        if (options.parseProp) {
                            t = options.parseProp(t, name, type);
                        }

                        if (type._type === BOOLEAN) {
                            t = t.toLowerCase();
                            t = t == 'true' || t == 'yes';
                        }
                        
                        if (type._set) {
                            type._set(curObj, name, t);
                        }
                        else if (type._targetProp) {
                            curObj[type._targetProp] = t;
                        }
                        else {
                            //console.log('SETTING PROP: ', name, type);
                            curObj[name] = t;
                        }
                    }
                };
                
                var _expected = function(isAttribute) {
                    var expected = [];
                    //console.log(curType);
                    forEachEntry(curType, function(key, value) {
                        if (strings.startsWith(key, "_")) {
                            return;
                        }
                        
                        if (isAttribute && value._type === OBJECT) {
                            return;
                        }
                        
                        expected.push(isAttribute ? key : "<" + key + ">");
                        
                    }, this);
                    return '[' + expected.join(', ') + ']';
                };
                
                saxParser.on({
                    error: function (e) {
                        throw e;
                    },
                    
                    startElement: function (el) {
                        
                        var getType = function(el, nodeType) {
                                var lookupType = function(key) {
                                    var type;
                                    
                                    if (nodeType === 'attribute') {
                                        type = curType['@' + key];
                                    }
                                    else if (nodeType === 'element') {
                                        type = curType['<' + key + '>'];
                                    }
                                    if (!type) {
                                        type = curType[key];
                                    }
                                    return type;
                                };
                                
                                var uri = el.getURI();
                                if (uri) {
                                    type = lookupType(uri + ":" + el.getLocalName());
                                    if (!type) {
                                        type = lookupType(uri + ":*");                                        
                                    }
                                }
                                else {
                                    type = lookupType(el.getLocalName());
                                }
                                
                                if (!type) {
                                    type = lookupType("*");                                        
                                }
                                
                                if (typeof type === 'function') {
                                    type = type(el, nodeType);
                                }
                                
                                return type;
                            },
                            type = getType(el, "element");
                            
                        if (!type) {
                            _handleError("Unexpected element: <" + el.getQName() + ">. Expected one of: " + _expected());
                        }
                        
                        
                        curType = type;
                        typeStack.push(type);
                        
                        if (type._type === STRING || type._type === BOOLEAN) {
                            curProp = el.getLocalName();
                            
                            if (type._begin) {
                                type._begin(curObj, el.getLocalName(), el.getURI());
                            }
                        }
                        else if (type._type === OBJECT) {
                            curObj = type._begin ? type._begin(curObj, el) : {};
                            if (!curObj) {
                                throw new Error('_begin() for "' + el.getLocalName() + '" did not return an object.');
                            }
                            objStack.push(curObj);
                            
                            if (objStack.length === 1) {
                                rootObj = curObj;
                            }
                        }
                        
                        
                        forEach(el.getAttributes(), function(attr) {
                            
                            var type = getType(attr, "attribute");
                            if (!type) {
                                _handleError("Unexpected attribute: " + attr.getQName() + ". Expected one of: " + _expected(true));
                            }
                            
                            _setProp(attr.getLocalName(), type, attr.getValue());
                            
                        });
                        
                    },
    
                    characters: function (t) {
                        if (!curProp && strings.trim(t)) {
                            _handleError('Unexpected text: "' + t + '"');
                        }
                        curText = curText ? curText + t : t;
                    },
    
                    endElement: function () {
                        if (curText) {
                            _setProp(curProp, curType, curText);
                        }
                        curText = null;
                        
                        if (curType._type === STRING || curType._type === BOOLEAN) {
                            curProp = null;
                        }
                        else if (curType._type === OBJECT) {
    
                            var completedObj = arrays.pop(objStack);
                            curObj = arrays.peek(objStack);
                            
                            if (curType._end) {
                                curType._end(completedObj, curObj);
                            }
                        }
                        else if (curType._type) {
                            throw new Error("Invalid type: " + curType._type);
                        }
                        
                        
                        arrays.pop(typeStack);
                        curType = arrays.peek(typeStack);
                        
                    }
                });
                
                saxParser.parse(xmlSrc, filePath);
                
                return rootObj;
            }
        };
    });