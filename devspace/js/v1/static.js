!function(e){var t={};function n(o){if(t[o])return t[o].exports;var r=t[o]={i:o,l:!1,exports:{}};return e[o].call(r.exports,r,r.exports,n),r.l=!0,r.exports}n.m=e,n.c=t,n.d=function(e,t,o){n.o(e,t)||Object.defineProperty(e,t,{enumerable:!0,get:o})},n.r=function(e){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})},n.t=function(e,t){if(1&t&&(e=n(e)),8&t)return e;if(4&t&&"object"==typeof e&&e&&e.__esModule)return e;var o=Object.create(null);if(n.r(o),Object.defineProperty(o,"default",{enumerable:!0,value:e}),2&t&&"string"!=typeof e)for(var r in e)n.d(o,r,function(t){return e[t]}.bind(null,r));return o},n.n=function(e){var t=e&&e.__esModule?function(){return e.default}:function(){return e};return n.d(t,"a",t),t},n.o=function(e,t){return Object.prototype.hasOwnProperty.call(e,t)},n.p="",n(n.s=97)}({9:function(e,t,n){"use strict";Object.defineProperty(t,"__esModule",{value:!0}),t.userAgentClassNames=function(){const e=function(){const e=navigator.userAgent;let t="Unknown",n="pc",o="";/linux/i.test(e)?t="linux":/macintosh|mac os x/i.test(e)?t="mac":/windows|win32/i.test(e)&&(t="windows"),/iPhone/i.test(e)?n="mobile ios iphone":/iPod/i.test(e)?n="mobile ios ipod":/iPad/i.test(e)?n="mobile ios ipad":/Android/i.test(e)&&(n="mobile android");const r=/Opera/i.test(e);return/MSIE/i.test(e)&&!r?o="MSIE":/Firefox/i.test(e)?o="Firefox":/YaBrowser/i.test(e)?o="YaBrowser":/Edge/i.test(e)?o="Edge":/Chrome/i.test(e)?o="Chrome":/Safari/i.test(e)?o="Safari":r?o="Opera":/Netscape/i.test(e)?o="Netscape":/rv:11/i.test(e)&&(o="ie11"),{uaClass:o,platform:t,device:n}}();return e.device+" "+e.platform.toLowerCase()+" "+e.uaClass.toLowerCase()}},97:function(e,t,n){"use strict";Object.defineProperty(t,"__esModule",{value:!0});const o=n(9);!function(){const e=document.getElementById("body");null!==e?e.className+=" "+o.userAgentClassNames():console.error("body undefined")}()}});