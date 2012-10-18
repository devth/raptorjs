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

raptor.defineClass(
    'templating.compiler.TextNode',
    'templating.compiler.Node',
    function() {
        "use strict";
        
        var escapeXml = raptor.require('xml.utils').escapeXml,
            escapeXmlAttr = raptor.require('xml.utils').escapeXmlAttr,
            EscapeXmlContext = raptor.require('templating.compiler.EscapeXmlContext');
        
        var TextNode = function(text, escapeXml) {
            TextNode.superclass.constructor.call(this, 'text');
            this.text = text;
            this.escapeXml = escapeXml !== false;
        };
        
        TextNode.prototype = {
                
            normalizeText: function() {
                var normalizedText = this.getEscapedText(),
                    curChild = this.nextSibling,
                    nodeToRemove;
                
                while(curChild && curChild.isTextNode()) {
                    normalizedText += curChild.getEscapedText();
                    nodeToRemove = curChild;
                    curChild = curChild.nextSibling;
                    nodeToRemove.detach(); 
                }
                
                this.setText(normalizedText);
                this.escapeXml = false; //Make sure the text is not re-escaped
            },
            
            getEscapedText: function() {
                var text = this.getText();
                var parentNode = this.parentNode;
                var shouldEscapeXml = this.escapeXml !== false && parentNode && parentNode.isEscapeXmlBodyText() !== false;
                if (shouldEscapeXml) {
                    if (this.getEscapeXmlContext() === EscapeXmlContext.Attribute) {
                        return escapeXmlAttr(text);
                    }
                    else {
                        return escapeXml(text);
                    }
                }
                else {
                    return text;
                }
            },
                
            doGenerateCode: function(template) {
                /*
                 * After all of the transformation of the tree we
                 * might have ended up with multiple text nodes
                 * as siblings. We want to normalize adjacent
                 * text nodes so that whitespace removal rules
                 * will be correct
                 */
                this.normalizeText();
                
                var text = this.getText();
                if (text) {
                    var preserveWhitespace = this.isPreserveWhitespace();
                    
                    if (!preserveWhitespace) {
                        
                        if (!this.previousSibling) {
                            //First child
                            text = text.replace(/^\n\s*/g, "");  
                        }
                        if (!this.nextSibling) {
                            //Last child
                            text = text.replace(/\n\s*$/g, ""); 
                        }
                        
                        if (/^\n\s*$/.test(text)) { //Whitespace between elements
                            text = '';
                        }
                        
                        text = text.replace(/\s+/g, " ");
                        
                        if (this.isWordWrapEnabled() && text.length > 80) {
                            
                            var start=0,
                                end;
                            
                            while (start < text.length) {
                                end = Math.min(start+80, text.length);
                                
                                var lastSpace = text.substring(start, end).lastIndexOf(' ');
                                if (lastSpace != -1) {
                                    lastSpace = lastSpace + start; //Adjust offset into original string
                                }
                                else {
                                    lastSpace = text.indexOf(' ', end); //No space before the 80 column mark... search for the first space after to break on
                                }
                                
                                if (lastSpace != -1) {
                                    text = text.substring(0, lastSpace) + "\n" + text.substring(lastSpace+1);
                                    start = lastSpace + 1;
                                }
                                else {
                                    break;
                                }
                                
                            }
                        }
                    }

                    template.text(text);
                }
            },
            
            getText: function() {
                return this.text;
            },
            
            setText: function(text) {
                this.text = text;
            },
            
            isTextNode: function() {
                return true;
            },
            
            isElementNode: function() {
                return false;
            },
            
            setEscapeXml: function(escapeXml) {
                this.escapeXml = escapeXml;
            },

            isEscapeXml: function() {
                return this.escapeXml;
            },

            toString: function() {
                var text = this.text && this.text.length > 25 ? this.text.substring(0, 25) + '...' : this.text;
                text = text.replace(/[\n]/g, '\\n');
                return "[text: " + text + "]";
            }
        };
        
        return TextNode;
    });