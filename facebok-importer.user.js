// ==UserScript==
// @name        MusicBrainz: Import events from Facebook
// @version     2016-01-15
// @author      Ohm Patel
// @require     https://code.jquery.com/jquery-2.2.0.min.js
// @grant       none
//
// @include     *://www.facebook.*/events/*
// ==/UserScript==

var API_URL = "//graph.facebook.com/v2.5/";
var API_KEY = "CAAO2IKDySlMBAOZAVymMJ5EqAJFoVEMPg0FqaojoeP8MamUjoteZCCEJdovGTbGDYIfxvI3K4i6ZB82PElo4vFZAk7EbqelEm7wSzs61cgqrf0jneTDftN0WoXKsrL3hgyVBcExOWZC4ZAgM6E3ZAyDgEbuE40bqF9ZBGBqjeOfv7YfNk23CJJTzq5AYzmfpNGopZCSrsyjTFzQZDZD";
var GITHUB_URL = "";

$(window).load(function () {
  // Create Form
  var addForm = document.createElement("form");
  addForm.method = "get";
  addForm.target = "_blank";
  addForm.action = document.location.protocol + "//musicbrainz.org/event/create";
  var addBtnElem = document.createElement("input");
  addBtnElem.value = "Add event to MusicBrainz";
  addBtnElem.type = "submit";
  addForm.appendChild(addBtnElem);
  var div = document.createElement("div");
  div.appendChild(addForm);
  var parent = document.getElementById("event_button_bar");
  parent.insertBefore(div, parent.firstChild);
  
  // Facebook API Call & Set Options
  var event_id = window.location.pathname.split("/")[2];
  var url = API_URL + event_id + "/?access_token=" + API_KEY;
  $.getJSON(url, function (eventData) {
    add_field("edit-event.name", eventData.name);
    add_field("edit-event.edit_note", "Imported from " + window.location.href + " using " + GITHUB_URL);
    
    add_field("urls.0.url", window.location.href);
    add_field("urls.0.link_type", "783");
    
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
