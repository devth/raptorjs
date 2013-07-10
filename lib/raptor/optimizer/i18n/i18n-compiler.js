/*
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
 define('raptor/optimizer/i18n/i18n-compiler', function(raptor, exports, module) {
    "use strict";

    var i18n = require('raptor/i18n');

    return {
        compileDictionary: function(name, localeCode, dictionary, writer) {
            var keys = Object.keys(dictionary);
            
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                if (key.endsWith('.comment')) {
                    delete dictionary[key];
                } else if (key.endsWith('.template')) {
                    var dust = require('dustjs-linkedin');
                    writer.write(dust.compile(dictionary[key], key));
                    dictionary[key] = {
                        type: 'dust'
                    };
                }
            }

            writer.write('$rset("i18n-module", ');
            writer.write(JSON.stringify(i18n.getDictionaryName(name, localeCode)));
            writer.write(', ');
            writer.write(JSON.stringify(dictionary, null, ' '));
            writer.write(');');
        }
    };
 });