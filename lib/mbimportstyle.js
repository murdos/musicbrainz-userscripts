function _add_css(css) {
  $("<style type='text/css'>"+css.replace(/\s+/g, ' ') + "</style>").appendTo("head");
}

function MBImportStyle() {
  var css_import_button = "  \
  .musicbrainz_import button {  \
    -moz-border-radius:5px;  \
    -webkit-border-radius:5px;  \
    border-radius:5px;  \
    display:inline-block;  \
    cursor:pointer;  \
    font-family:Arial;  \
    font-size:14px !important;  \
    padding:3px 6px;  \
    text-decoration:none;  \
    border: 1px solid #888 !important; \
    background-color: rgba(240,240,240,0.8) !important; \
    color: #334 !important; \
  }  \
  .musicbrainz_import button:hover {  \
    background-color: rgba(250,250,250,0.9) !important; \
  }  \
  .musicbrainz_import button:active {  \
    position:relative;  \
    top:1px;  \
  }  \
  .musicbrainz_import button img { \
    vertical-align: middle !important; \
    margin-right: 4px !important; \
  } \
  ";
  _add_css(css_import_button);
}
