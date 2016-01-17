// ==UserScript==
// @name        MusicBrainz: Import events from Facebook
// @version     2016-01-17
// @author      Ohm Patel
// @require     https://code.jquery.com/jquery-2.2.0.min.js
// @grant       none
// @include     *://www.facebook.*/events/*
// ==/UserScript==

var API_URL = "//graph.facebook.com/v2.5/";
var API_KEY = "CAAO2IKDySlMBAOc6UU5jRHqiEFrENsZC09f4KJsMpDPOTV9gAjZC5tIdVqBeibxfk0i2XwuHL61ywnQdnI4KdCgwCfZCXwc0ZCryj48a1PRjVMuCbpoScvzeYlrTujLynPPKdgS66eLAvqGZCzl3Kj7ahRj97tYeR4VIGGVCQ9pRWDxZC9rPzIBEFTjvjBZCacZD";

$(window).load(function () {
  // Create Form
  var addForm = document.createElement('form');
  addForm.method = 'get';
  addForm.target = '_blank';
  addForm.action = document.location.protocol + '//musicbrainz.org/event/create';
  var addBtnElem = document.createElement('input');
  addBtnElem.value = 'Add event to MusicBrainz';
  addBtnElem.type = 'submit';
  $(addBtnElem).css({
    'border-color': '#CCC #C5C6C8 #B6B7B9',
    'color': '#4E5665',
    'text-shadow': '0px 1px 0px #FFF',
    'padding': '3px 0px',
    'z-index': '1'
  });
  addForm.appendChild(addBtnElem);
  var div = document.createElement('div');
  $(div).css({
    'display': 'inline-block'
  });
  div.appendChild(addForm);
  var parent = document.getElementById('event_button_bar');
  parent.insertBefore(div, parent.firstChild);
  
  // Facebook API Call & Set Options
  var event_id = window.location.pathname.split("/")[2];
  var url = API_URL + event_id + "/?access_token=" + API_KEY;
  $.getJSON(url, function (eventData) {
    add_field("edit-event.name", eventData.name);
    add_field("edit-event.edit_note", "Imported from " + window.location.href + " using MusicBrainz - Facebook Event Importer");
    
    add_field("edit-event.url.0.text", window.location.href);
    add_field("edit-event.url.0.link_type_id", "783");
    
    add_field("edit-event.period.begin_date.year", eventData.start_time.substring(0,4));
    add_field("edit-event.period.begin_date.month", eventData.start_time.substring(5,7));
    add_field("edit-event.period.begin_date.day", eventData.start_time.substring(8,10));
    add_field("edit-event.time", eventData.start_time.substring(11,16));
  });
  
  // Add Field Function
  function add_field(name, value) {
    var field = document.createElement("input");
    field.type = "hidden";
    field.name = name;
    field.value = value;
    addForm.appendChild(field);
  }
});
