function _add_css(css: string): void {
    document.head.insertAdjacentHTML('beforeend', `<style>${css.replace(/\s+/g, ' ')}</style>`);
}

export function MBImportStyle(): void {
    const css_import_button = `
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

export function MBSearchItStyle(): void {
    const css_search_it = `
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
   .mb_valign.mb_searchit {
     font-weight: bold;
     line-height: 16px;
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
   .mb_lookup_loading > *,
   .mb_lookup_error > * {
     display: none !important;
   }
   .mb_lookup_loading::before {
     content: '';
     display: inline-block;
     width: 11px;
     height: 11px;
     box-sizing: border-box;
     border: 2px solid #d7ca75;
     border-top-color: #ba478f;
     border-radius: 50%;
     vertical-align: -1px;
     animation: mb_lookup_spin 0.8s linear infinite;
   }
   .mb_lookup_error::before {
     content: '⚠';
     color: #c62828;
     font-size: 13px;
     line-height: 16px;
   }
   @keyframes mb_lookup_spin {
     to { transform: rotate(360deg); }
   }
   .mb_wrapper {
     display: inline-block;
   }
   `;
    _add_css(css_search_it);
}
