function _add_css(css) {
    document.head.insertAdjacentHTML('beforeend', `<style>${css.replace(/\s+/g, ' ')}</style>`);
}

function MBImportStyle() {
    let css_import_button = `
    #mb_buttons {
        display: flex;
        gap: 5px;
    }
  .musicbrainz_import button {
    margin: 0 !important;
    border-radius:5px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor:pointer;
    font-family:Arial;
    font-size:12px !important;
    padding:3px 6px;
    text-decoration:none;
    border: 1px solid rgba(180,180,180,0.8) !important;
    background-color: rgba(240,240,240,0.8) !important;
    color: #334 !important;
    height: 26px ;
  }
  .musicbrainz_import button:hover {
    background-color: rgba(250,250,250,0.9) !important;
  }
  .musicbrainz_import button:active {
    background-color: rgba(170,170,170,0.8) !important;
  }
  .musicbrainz_import button img {
    vertical-align: middle !important;
    margin-right: 4px !important;
    height: 16px;
  }
  img[src*="musicbrainz.org"] {
    display: inline-block;
  }
  `;
    _add_css(css_import_button);
}

function MBSearchItStyle() {
    let css_search_it = `
   .mb_valign {
     display: inline-block;
     vertical-align: top;
   }
   .mb_searchit {
     width: 16px;
     height: 16px;
     margin: 0;
     padding: 0;
     background-color: #FFF7BE;
     border: 0px;
     vertical-align: top;
     font-size: 11px;
     text-align: center;
   }
   a.mb_search_link {
     color: #888;
     text-decoration: none;
   }
   a.mb_search_link small {
     font-size: 8px;
   }
   .mb_searchit a.mb_search_link:hover {
     color: darkblue;
   }
   .mb_wrapper {
     display: inline-block;
   }
   `;
    _add_css(css_search_it);
}
