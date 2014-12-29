// ==UserScript==
// @name        MusicBrainz: Batch-add "performance of" relationships
// @version     2014-12-28
// @author      Michael Wiencek
// @include     *://musicbrainz.org/artist/*/recordings*
// @include     *://*.musicbrainz.org/artist/*/recordings*
// @match       *://musicbrainz.org/artist/*/recordings*
// @match       *://*.musicbrainz.org/artist/*/recordings*
// ==/UserScript==
//**************************************************************************//

var scr = document.createElement("script");
scr.textContent = "(" + batch_recording_rels + ")();";
document.body.appendChild(scr);

function batch_recording_rels() {

    function make_element(el_name, args) {
        var el = $("<"+el_name+"></"+el_name+">");
        el.append.apply(el, args);
        return el;
    }
    function td() {
        return make_element("td", arguments);
    }
    function tr() {
        return make_element("tr", arguments);
    }
    function table() {
        return make_element("table", arguments);
    }
    function label() {
        return make_element("label", arguments);
    }
    function goBtn(func) {
        return $("<button>Go</button>").click(func);
    }

    var TITLE_SELECTOR = "a[href*='" + window.location.host + "/recording/']";

    var $recordings = $('tr:has(' + TITLE_SELECTOR + ')').data('filtered', false);
    if (!$recordings.length) {
        return;
    }

    var MBID_REGEX = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/;

    var RECORDING_TITLES = {};

    var ASCII_PUNCTUATION = [
        [/…/g, "..."],
        [/‘/g, "'"],
        [/’/g, "'"],
        [/‚/g, "'"],
        [/“/g, "\""],
        [/”/g, "\""],
        [/„/g, "\""],
        [/′/g, "'"],
        [/″/g, "\""],
        [/‹/g, "<"],
        [/›/g, ">"],
        [/‐/g, "-"],
        [/‒/g, "-"],
        [/–/g, "-"],
        [/−/g, "-"],
        [/—/g, "-"],
        [/―/g, "--"]
    ];

    function normalizeTitle(title) {
        title = title.toLowerCase().replace(/\s+/g, '');

        for (var i = 0, len = ASCII_PUNCTUATION.length; i < len; i++) {
            title = title.replace(ASCII_PUNCTUATION[i][0], ASCII_PUNCTUATION[i][1]);
        }

        return title;
    }

    $recordings.each(function (index, row) {
        var $title = $(row).find(TITLE_SELECTOR);
        var mbid = $title.attr('href').match(MBID_REGEX)[0];

        RECORDING_TITLES[mbid] = normalizeTitle(
            $title.text().match(/^(.+?)(?:(?: \([^()]+\))+)?$/)[1]
        );
    });

    var work_type_options = '\
<select id="bpr-work-type">\
<option selected="selected"></option>\
<option value="1">Aria</option>\
<option value="2">Ballet</option>\
<option value="3">Cantata</option>\
<option value="4">Concerto</option>\
<option value="5">Sonata</option>\
<option value="6">Suite</option>\
<option value="7">Madrigal</option>\
<option value="8">Mass</option>\
<option value="9">Motet</option>\
<option value="10">Opera</option>\
<option value="11">Oratorio</option>\
<option value="12">Overture</option>\
<option value="13">Partita</option>\
<option value="14">Quartet</option>\
<option value="15">Song-cycle</option>\
<option value="16">Symphony</option>\
<option value="17">Song</option>\
<option value="18">Symphonic poem</option>\
<option value="19">Zarzuela</option>\
<option value="20">Étude</option>\
<option value="21">Poem</option>\
</select>';

    var work_language_options = '\
<select id="bpr-work-language">\
<option selected="selected"></option>\
<optgroup label="Frequently used">\
<option value="18">Arabic</option>\
<option value="76">Chinese</option>\
<option value="98">Czech</option>\
<option value="100">Danish</option>\
<option value="113">Dutch</option>\
<option value="120">English</option>\
<option value="131">Finnish</option>\
<option value="134">French</option>\
<option value="145">German</option>\
<option value="159">Greek</option>\
<option value="195">Italian</option>\
<option value="198">Japanese</option>\
<option value="309">Norwegian</option>\
<option value="338">Polish</option>\
<option value="340">Portuguese</option>\
<option value="353">Russian</option>\
<option value="393">Spanish</option>\
<option value="403">Swedish</option>\
<option value="433">Turkish</option>\
<option value="284">[Multiple languages]</option>\
</optgroup>\
<optgroup label="Other">\
<option value="2">Abkhazian</option>\
<option value="3">Achinese</option>\
<option value="4">Acoli</option>\
<option value="5">Adangme</option>\
<option value="6">Adyghe</option>\
<option value="1">Afar</option>\
<option value="8">Afrihili</option>\
<option value="9">Afrikaans</option>\
<option value="473">Ainu</option>\
<option value="10">Akan</option>\
<option value="12">Albanian</option>\
<option value="13">Aleut</option>\
<option value="15">Amharic</option>\
<option value="475">Angika</option>\
<option value="20">Aragonese</option>\
<option value="23">Arapaho</option>\
<option value="25">Arawak</option>\
<option value="21">Armenian</option>\
<option value="479">Aromanian</option>\
<option value="26">Assamese</option>\
<option value="27">Asturian</option>\
<option value="30">Avaric</option>\
<option value="31">Avestan</option>\
<option value="32">Awadhi</option>\
<option value="33">Aymara</option>\
<option value="34">Azerbaijani</option>\
<option value="40">Balinese</option>\
<option value="38">Baluchi</option>\
<option value="39">Bambara</option>\
<option value="42">Basa</option>\
<option value="37">Bashkir</option>\
<option value="41">Basque</option>\
<option value="44">Beja</option>\
<option value="45">Belarusian</option>\
<option value="46">Bemba</option>\
<option value="47">Bengali</option>\
<option value="49">Bhojpuri</option>\
<option value="51">Bikol</option>\
<option value="52">Bini</option>\
<option value="53">Bislama</option>\
<option value="64">Blin</option>\
<option value="56">Bosnian</option>\
<option value="57">Braj</option>\
<option value="58">Breton</option>\
<option value="61">Buginese</option>\
<option value="62">Bulgarian</option>\
<option value="60">Buriat</option>\
<option value="63">Burmese</option>\
<option value="65">Caddo</option>\
<option value="68">Catalan</option>\
<option value="70">Cebuano</option>\
<option value="75">Chagatai</option>\
<option value="72">Chamorro</option>\
<option value="74">Chechen</option>\
<option value="82">Cherokee</option>\
<option value="85">Cheyenne</option>\
<option value="73">Chibcha</option>\
<option value="313">Chichewa</option>\
<option value="79">Chinook jargon</option>\
<option value="81">Chipewyan</option>\
<option value="80">Choctaw</option>\
<option value="83">Church Slavic</option>\
<option value="77">Chuukese</option>\
<option value="84">Chuvash</option>\
<option value="87">Coptic</option>\
<option value="88">Cornish</option>\
<option value="89">Corsican</option>\
<option value="93">Cree</option>\
<option value="286">Creek</option>\
<option value="94">Crimean Tatar</option>\
<option value="366">Croatian</option>\
<option value="99">Dakota</option>\
<option value="101">Dargwa</option>\
<option value="103">Delaware</option>\
<option value="106">Dinka</option>\
<option value="107">Divehi</option>\
<option value="108">Dogri</option>\
<option value="105">Dogrib</option>\
<option value="111">Duala</option>\
<option value="114">Dyula</option>\
<option value="115">Dzongkha</option>\
<option value="116">Efik</option>\
<option value="118">Ekajuk</option>\
<option value="119">Elamite</option>\
<option value="290">Erzya</option>\
<option value="122">Esperanto</option>\
<option value="123">Estonian</option>\
<option value="124">Ewe</option>\
<option value="125">Ewondo</option>\
<option value="126">Fang</option>\
<option value="128">Fanti</option>\
<option value="127">Faroese</option>\
<option value="129">Fijian</option>\
<option value="130">Filipino</option>\
<option value="133">Fon</option>\
<option value="485">Frisian, Eastern</option>\
<option value="484">Frisian, Northern</option>\
<option value="137">Frisian, Western</option>\
<option value="139">Friulian</option>\
<option value="138">Fulah</option>\
<option value="140">Ga</option>\
<option value="67">Galibi Carib</option>\
<option value="150">Galician</option>\
<option value="249">Ganda</option>\
<option value="141">Gayo</option>\
<option value="142">Gbaya</option>\
<option value="146">Geez</option>\
<option value="144">Georgian</option>\
<option value="299">German, Low</option>\
<option value="476">German, Swiss</option>\
<option value="147">Gilbertese</option>\
<option value="154">Gondi</option>\
<option value="155">Gorontalo</option>\
<option value="156">Gothic</option>\
<option value="157">Grebo</option>\
<option value="158">Greek, Ancient</option>\
<option value="204">Greenlandic</option>\
<option value="160">Guarani</option>\
<option value="161">Gujarati</option>\
<option value="162">Gwich\'in</option>\
<option value="163">Haida</option>\
<option value="164">Haitian Creole</option>\
<option value="165">Hausa</option>\
<option value="166">Hawaiian</option>\
<option value="167">Hebrew</option>\
<option value="168">Herero</option>\
<option value="169">Hiligaynon</option>\
<option value="171">Hindi</option>\
<option value="174">Hiri Motu</option>\
<option value="173">Hmong</option>\
<option value="176">Hungarian</option>\
<option value="177">Hupa</option>\
<option value="178">Iban</option>\
<option value="180">Icelandic</option>\
<option value="181">Ido</option>\
<option value="179">Igbo</option>\
<option value="186">Iloko</option>\
<option value="189">Indonesian</option>\
<option value="191">Ingush</option>\
<option value="187">Interlingua</option>\
<option value="185">Interlingue</option>\
<option value="184">Inuktitut</option>\
<option value="192">Inupiaq</option>\
<option value="149">Irish</option>\
<option value="196">Javanese</option>\
<option value="200">Judeo-Arabic</option>\
<option value="199">Judeo-Persian</option>\
<option value="212">Kabardian</option>\
<option value="202">Kabyle</option>\
<option value="203">Kachin</option>\
<option value="459">Kalmyk</option>\
<option value="205">Kamba</option>\
<option value="206">Kannada</option>\
<option value="209">Kanuri</option>\
<option value="201">Kara-Kalpak</option>\
<option value="227">Karachay-Balkar</option>\
<option value="477">Karelian</option>\
<option value="208">Kashmiri</option>\
<option value="96">Kashubian</option>\
<option value="211">Kazakh</option>\
<option value="213">Khasi</option>\
<option value="215">Khmer, Central</option>\
<option value="217">Kikuyu</option>\
<option value="220">Kimbundu</option>\
<option value="218">Kinyarwanda</option>\
<option value="219">Kirghiz</option>\
<option value="421">Klingon</option>\
<option value="222">Komi</option>\
<option value="223">Kongo</option>\
<option value="221">Konkani</option>\
<option value="224">Korean</option>\
<option value="225">Kosraean</option>\
<option value="226">Kpelle</option>\
<option value="230">Kuanyama</option>\
<option value="231">Kumyk</option>\
<option value="232">Kurdish</option>\
<option value="229">Kurukh</option>\
<option value="233">Kutenai</option>\
<option value="3529">Kölsch</option>\
<option value="234">Ladino</option>\
<option value="235">Lahnda</option>\
<option value="236">Lamba</option>\
<option value="237">Lao</option>\
<option value="238">Latin</option>\
<option value="239">Latvian</option>\
<option value="240">Lezghian</option>\
<option value="241">Limburgish</option>\
<option value="242">Lingala</option>\
<option value="243">Lithuanian</option>\
<option value="3858">Liv</option>\
<option value="197">Lojban</option>\
<option value="245">Lozi</option>\
<option value="248">Luba-Katanga</option>\
<option value="247">Luba-Lulua</option>\
<option value="250">Luiseno</option>\
<option value="251">Lunda</option>\
<option value="252">Luo</option>\
<option value="253">Lushai</option>\
<option value="246">Luxembourgish</option>\
<option value="254">Macedonian</option>\
<option value="255">Madurese</option>\
<option value="256">Magahi</option>\
<option value="258">Maithili</option>\
<option value="259">Makasar</option>\
<option value="275">Malagasy</option>\
<option value="266">Malay</option>\
<option value="260">Malayalam</option>\
<option value="276">Maltese</option>\
<option value="277">Manchu</option>\
<option value="268">Mandar</option>\
<option value="1739">Mandarin Chinese</option>\
<option value="261">Mandingo</option>\
<option value="278">Manipuri</option>\
<option value="151">Manx</option>\
<option value="262">Maori</option>\
<option value="22">Mapudungun</option>\
<option value="264">Marathi</option>\
<option value="78">Mari</option>\
<option value="257">Marshallese</option>\
<option value="288">Marwari</option>\
<option value="265">Masai</option>\
<option value="269">Mende</option>\
<option value="271">Mi\'kmaq</option>\
<option value="4663">Min Nan Chinese</option>\
<option value="272">Minangkabau</option>\
<option value="287">Mirandese</option>\
<option value="280">Mohawk</option>\
<option value="267">Moksha</option>\
<option value="244">Mongo</option>\
<option value="282">Mongolian</option>\
<option value="4369">Montagnais</option>\
<option value="283">Mossi</option>\
<option value="478">N\'Ko</option>\
<option value="294">Nauru</option>\
<option value="295">Navajo</option>\
<option value="297">Ndebele, North</option>\
<option value="296">Ndebele, South</option>\
<option value="298">Ndonga</option>\
<option value="293">Neapolitan</option>\
<option value="301">Nepal Bhasa</option>\
<option value="300">Nepali</option>\
<option value="302">Nias</option>\
<option value="304">Niuean</option>\
<option value="486">No linguistic content</option>\
<option value="307">Nogai</option>\
<option value="308">Norse, Old</option>\
<option value="306">Norwegian Bokmål</option>\
<option value="305">Norwegian Nynorsk</option>\
<option value="314">Nyamwezi</option>\
<option value="315">Nyankole</option>\
<option value="316">Nyoro</option>\
<option value="317">Nzima</option>\
<option value="318">Occitan</option>\
<option value="319">Ojibwa</option>\
<option value="320">Oriya</option>\
<option value="321">Oromo</option>\
<option value="322">Osage</option>\
<option value="323">Ossetian</option>\
<option value="332">Palauan</option>\
<option value="337">Pali</option>\
<option value="329">Pampanga</option>\
<option value="327">Pangasinan</option>\
<option value="330">Panjabi</option>\
<option value="331">Papiamento</option>\
<option value="334">Persian</option>\
<option value="339">Pohnpeian</option>\
<option value="343">Pushto</option>\
<option value="5603">Puyuma</option>\
<option value="344">Quechua</option>\
<option value="345">Rajasthani</option>\
<option value="346">Rapanui</option>\
<option value="347">Rarotongan</option>\
<option value="351">Romanian</option>\
<option value="349">Romansh</option>\
<option value="350">Romany</option>\
<option value="352">Rundi</option>\
<option value="5690">Réunion Creole French</option>\
<option value="359">Samaritan Aramaic</option>\
<option value="383">Sami, Inari</option>\
<option value="382">Sami, Lule</option>\
<option value="380">Sami, Northern</option>\
<option value="385">Sami, Skolt</option>\
<option value="379">Sami, Southern</option>\
<option value="384">Samoan</option>\
<option value="354">Sandawe</option>\
<option value="355">Sango</option>\
<option value="360">Sanskrit</option>\
<option value="362">Santali</option>\
<option value="394">Sardinian</option>\
<option value="361">Sasak</option>\
<option value="365">Scots</option>\
<option value="148">Scottish Gaelic</option>\
<option value="367">Selkup</option>\
<option value="363">Serbian</option>\
<option value="395">Serer</option>\
<option value="371">Shan</option>\
<option value="386">Shona</option>\
<option value="182">Sichuan Yi</option>\
<option value="364">Sicilian</option>\
<option value="372">Sidamo</option>\
<option value="54">Siksika</option>\
<option value="387">Sindhi</option>\
<option value="373">Sinhala</option>\
<option value="104">Slave (Athapascan)</option>\
<option value="377">Slovak</option>\
<option value="378">Slovenian</option>\
<option value="390">Somali</option>\
<option value="388">Soninke</option>\
<option value="110">Sorbian, Lower</option>\
<option value="175">Sorbian, Upper</option>\
<option value="310">Sotho, Northern</option>\
<option value="392">Sotho, Southern</option>\
<option value="474">Southern Altai</option>\
<option value="480">Sranan Tongo</option>\
<option value="398">Sukuma</option>\
<option value="399">Sundanese</option>\
<option value="400">Susu</option>\
<option value="402">Swahili</option>\
<option value="397">Swati</option>\
<option value="404">Syriac</option>\
<option value="414">Tagalog</option>\
<option value="405">Tahitian</option>\
<option value="413">Tajik</option>\
<option value="423">Tamashek</option>\
<option value="407">Tamil</option>\
<option value="408">Tatar</option>\
<option value="409">Telugu</option>\
<option value="411">Tereno</option>\
<option value="412">Tetum</option>\
<option value="415">Thai</option>\
<option value="416">Tibetan</option>\
<option value="417">Tigre</option>\
<option value="418">Tigrinya</option>\
<option value="410">Timne</option>\
<option value="419">Tiv</option>\
<option value="422">Tlingit</option>\
<option value="426">Tok Pisin</option>\
<option value="420">Tokelau</option>\
<option value="424">Tonga (Nyasa)</option>\
<option value="425">Tonga (Tonga Islands)</option>\
<option value="427">Tsimshian</option>\
<option value="429">Tsonga</option>\
<option value="428">Tswana</option>\
<option value="431">Tumbuka</option>\
<option value="324">Turkish, Ottoman</option>\
<option value="430">Turkmen</option>\
<option value="435">Tuvalu</option>\
<option value="437">Tuvinian</option>\
<option value="436">Twi</option>\
<option value="438">Udmurt</option>\
<option value="440">Uighur</option>\
<option value="441">Ukrainian</option>\
<option value="442">Umbundu</option>\
<option value="444">Urdu</option>\
<option value="445">Uzbek</option>\
<option value="446">Vai</option>\
<option value="447">Venda</option>\
<option value="448">Vietnamese</option>\
<option value="449">Volapük</option>\
<option value="450">Votic</option>\
<option value="6966">Võro</option>\
<option value="457">Walloon</option>\
<option value="453">Waray</option>\
<option value="454">Washo</option>\
<option value="455">Welsh</option>\
<option value="452">Wolaitta</option>\
<option value="458">Wolof</option>\
<option value="460">Xhosa</option>\
<option value="5808">Yaeyama</option>\
<option value="356">Yakut</option>\
<option value="461">Yao</option>\
<option value="462">Yapese</option>\
<option value="463">Yiddish</option>\
<option value="464">Yoruba</option>\
<option value="7640">Yue Chinese</option>\
<option value="466">Zapotec</option>\
<option value="483">Zaza</option>\
<option value="467">Zenaga</option>\
<option value="468">Zhuang</option>\
<option value="470">Zulu</option>\
<option value="471">Zuni</option>\
<option value="24">[Artificial (Other)]</option>\
</optgroup>\
</select>';

    // Add button to manage performance ARs
    var $relate_table = table(
        tr(td(label("New work with this title:").attr('for',"bpr-new-work")),
           td('<input type="text" id="bpr-new-work"/>',
              goBtn(relate_to_new_titled_work))),
        tr(td(label("Existing work (URL/MBID):").attr('for',"bpr-existing-work")),
           td(entity_lookup($('<input type="text" id="bpr-existing-work"/>'), "work"),
              goBtn(relate_to_existing_work))),
        tr(td("New works using recording titles"),
           td(goBtn(relate_to_new_works))),
        tr(td("Their suggested works"),
           td(goBtn(relate_to_suggested_works))),
        tr(td(label("Work type:").attr('for',"bpr-work-type")),
           td(work_type_options)),
        tr(td(label("Lyrics language:").attr('for', "bpr-work-language")),
           td(work_language_options))).hide();

    var $works_table = table(
        $('<tr id="bpr-works-row"></tr>').append(
            td(label("Load another artist’s works (URL/MBID):").attr('for', "bpr-load-artist")),
            td(entity_lookup($('<input type="text" id="bpr-load-artist"/>'), "artist"),
               goBtn(load_artist_works_btn)))
            .hide());

    var $container = table(
        tr(td("<h3>Relate checked recordings to…</h3>"),
           td("<h3>Cached works</h3>",
              $("<span>(These are used to auto-suggest works.)</span>")
              .css("font-size", "0.9em"))),
        tr(td($relate_table),
           td($works_table)))
        .css({"margin": "0.5em", "background": "#F2F2F2", "border": "1px #999 solid"})
        .insertAfter($("div#content h2")[0]);

    $container.find("table").find("td").css("width", "auto");
    $container.children("tbody").children("tr").children("td")
        .css({"padding": "0.5em", "vertical-align": "top"});

    var hide_performed_recs = $.cookie('hide_performed_recs') === 'true' ? true : false;
    var hide_pending_edits = $.cookie('hide_pending_edits') === 'true' ? true : false;

    function make_checkbox(func, default_val, lbl) {
        var chkbox = $('<input type="checkbox"/>')
            .bind("change", func)
            .attr("checked", default_val);
        return label(chkbox, lbl)
    }

    var $display_table = table(
        tr(td(label("Filter recordings list: ",
                    $('<input type="text"/>').bind("input", filter_recordings))),
           td(make_checkbox(toggle_performed_recordings, hide_performed_recs,
                            "Hide recordings with performance ARs"),
              "&#160;",
              make_checkbox(toggle_pending_edits, hide_pending_edits,
                            "Hide recordings with pending edits"))))
        .css("margin", "0.5em")
        .insertAfter($container);

    var $recordings_load_msg = $("<span>Loading performance relationships…</span>");

    $("<span></span>")
        .append('<img src="/static/images/icons/loading.gif"/> ', $recordings_load_msg)
        .insertBefore($relate_table);

    // Add additional column

    $(".tbl > thead > tr").append("<th>Performance Attributes</th>");

    $recordings.append(
        $('<td class="bpr_attrs"></td>').append(
            $('<span class="partial">part.</span>/' +
              '<span class="live">live</span>/' +
              '<span class="instrumental">inst.</span>/' +
              '<span class="cover">cover</span>')
                .css("cursor", "pointer")
                .data("checked", false)
                .click(function () {
                    var $this = $(this), checked = !$this.data("checked");
                    $this.data("checked", checked);
                    if (checked) {
                        $this.css({"background": "blue", "color": "white"});
                    } else {
                        $this.css({"background": "inherit", "color": "black"});
                    }
                }), '&#160;<input type="text" class="date"/>'));

    $recordings.find("td.bpr_attrs input.date")
        .val("yyyy-mm-dd")
        .css({"color": "#ddd", "width": "7em", "border": "1px #999 solid"})
        .bind("focus", function () {
            if (this.value === "yyyy-mm-dd") {
                $(this).val("").css("color", "#000");
            }
        })
        .bind("blur", function () {
            if (this.value === "") {
                $(this).val("yyyy-mm-dd").css("color", "#ddd");
                $(this).parent().data("date", null);
            }
        })
        .bind("input", function () {
            var error = (function ($input) {
                return function () {
                    $input.css("border-color", "#f00");
                    $input.parent().data("date", null);
                };
            })($(this));

            if (this.value) {
                $(this).css("color", "#000");
                var date = this.value.match(/^([0-9]{4})(?:-([0-9]{2})(?:-([0-9]{2}))?)?$/);
                if (date == null) {
                    error();
                    return;
                }
                var data = {}, year = date[1], month = date[2], day = date[3];
                data["year"] = parseInt(year, 10);
                if (month) {
                    month = parseInt(month, 10);
                    if (month < 1 || month > 12) {
                        error();
                        return;
                    }
                    data["month"] = month;
                }
                if (day) {
                    day = parseInt(day, 10);
                    if (day < 1 || day > 31) {
                        error();
                        return;
                    }
                    data["day"] = day;
                }
                $(this).parent().data("date", data);
            } else {
                $(this).parent().data("date", null);
            }
            $(this).css("border-color", "#999");
        });

    // Style buttons

    function style_buttons($buttons) {
        return $buttons.css({
            "color": "#565656",
            "background-color": "#FFFFFF",
            "border": "1px solid #D0D0D0",
            "border-top": "1px solid #EAEAEA",
            "border-left": "1px solid #EAEAEA"});
    }

    style_buttons($container.find("button"));

    // Don't check hidden rows when the "select all" checkbox is pressed

    $(".tbl > thead input[type=checkbox]")
        .bind("change", function () {
            if (this.checked)
                $recordings
                    .filter(":hidden")
                    .find("input[name=add-to-merge]")
                    .attr("checked", false);
        });

    var artist_mbid = window.location.href.match(MBID_REGEX)[0],
        artist_name = $("h1 a").text(),
        $artist_works_msg = $("<td></td>"),
        ws_requests = new RequestManager(1000, 1),
        edit_requests = new RequestManager(1500, 2);

    var current_reqs = 0;
    setInterval(function () {
        if (current_reqs > 0) {
            current_reqs -= 1;
        }
    }, 1000);

    // Load performance relationships

    (function () {
        var page_numbers = $(".pageselector .sel")[0], not_parsed = $recordings.length;
        if (page_numbers === undefined) {
            var page = 1;
        } else {
            var page = parseInt(page_numbers.href.match(/.+\?page=(\d+)/)[1] || "1", 10),
                total_pages = $("a[rel=xhv\\:last]:first").next("em").text().match(/Page \d+ of (\d+)/);

            total_pages = Math.ceil((total_pages ? parseInt(total_pages[1], 10) : 1) / 2);
        }

        var request_recordings = function (url, callback) {
            var load_trys = 1;

            $.get(url, function (data) {
                var recs = data.recordings;
                var cache = {};

                for (var i = 0; i < recs.length; i++) {
                    var node = recs[i];
                    var row = cache[node.id];

                    if (row === undefined) {
                        for (var j = 0; j < $recordings.length; j++) {
                            var row_ = $recordings[j];
                            var row_id = $(row_).find(TITLE_SELECTOR).attr("href").match(MBID_REGEX)[0];

                            if (node.id === row_id) {
                                row = row_;
                                break;
                            } else {
                                cache[row_id] = row_;
                            }
                        }
                    }
                    if (row !== undefined) {
                        parse_recording(node, $(row));
                        not_parsed -= 1;
                    }
                }

                if (hide_performed_recs) {
                    $recordings.filter(".performed").hide();
                    restripeRows();
                }

                callback && callback();
            })
            .done(function () {
                $recordings_load_msg.parent().remove();
                $relate_table.show();
                load_works_init();
            })
            .fail(function () {
                $recordings_load_msg
                    .text("Error loading relationships. Retry #" + load_trys + "...")
                    .css("color", "red");
                load_trys += 1;
                ws_requests.unshift(request_recordings);
            });
        };
        var queue_recordings_request = function (url) {
            ws_requests.push(function () {
                request_recordings(url);
            });
        }
        var name_filter = $.trim($("#id-filter\\.name").val()),
            ac_filter = $.trim($("#id-filter\\.artist_credit_id").find("option:selected").text());

        function get_filtered_page(page) {
            var url = (
                "/ws/2/recording?query=" +
                (name_filter ? encodeURIComponent(name_filter) + "%20AND%20" : "") +
                (ac_filter ? "creditname:" + encodeURIComponent(ac_filter) + "%20AND%20" : "") +
                " arid:" + artist_mbid +
                "&limit=100" +
                "&offset=" + (page * 100) +
                "&fmt=json"
            );

            ws_requests.push(function () {
                $.get(url, function (data) {
                    _.each(data.recordings, function (r) {
                        queue_recordings_request("/ws/2/recording/" + r.id + "?inc=work-rels&fmt=json");
                    });

                    if (not_parsed > 0 && page < total_pages - 1) {
                        get_filtered_page(page + 1);
                    }
                });
            });
        }

        if (name_filter || ac_filter) {
            get_filtered_page(0);
        } else {
            queue_recordings_request(
                "/ws/2/recording?artist=" + artist_mbid +
                "&inc=work-rels" +
                "&limit=50" +
                "&offset=" + ((page - 1) * 50) +
                "&fmt=json"
            );
        }

        function parse_recording(node, $row) {
            var rels = node.relations;
            var rec_title = $row.children("td").not(":has(input)").first();

            $row.data("performances", []);
            var $attrs = $row.children("td.bpr_attrs"), performed = false;
            $attrs.data("checked", false).css("color", "black");

            _.each(rels, function (rel) {
                if (!rel.type.match(/performance/)) {
                    return;
                }

                if (!performed) {
                    $row.addClass("performed");
                    performed = true;
                }

                var work_mbid = rel.work.id;
                var work_title = rel.work.title;
                var work_comment = rel.work.disambiguation;
                var attrs = [];

                if (rel.begin) {
                    $attrs.find("input.date").val(rel.begin).trigger("input");
                }

                _.each(rel.attributes, function (name) {
                    name = name.toLowerCase();
                    attrs.push(name);

                    var $button = $attrs.find("span." + name);
                    if (!$button.data("checked")) {
                        $button.click();
                    }
                });

                add_work_link($row, work_mbid, work_title, work_comment, attrs);
                $row.data("performances").push(work_mbid);
            });

            var comment = node.disambiguation;
            if (comment) {
                var date = comment.match(/live(?: .+)?, ([0-9]{4}(?:-[0-9]{2}(?:-[0-9]{2})?)?)(?:\: .+)?$/);
                if (date) {
                    $attrs.find("input.date").val(date[1]).trigger("input");
                }
            }

            if (!performed) {
                if (node.title.match(/.+\(live.*\)/) || comment.match(/^live.*/)) {
                    $attrs.find("span.live").click();
                } else {
                    var url = "/ws/2/recording/" + node.id + "?inc=releases+release-groups&fmt=json";

                    var request_rec = function () {
                        $.get(url, function (data) {
                            var releases = data.releases;

                            for (var i = 0; i < releases.length; i++) {
                                if (_.contains(releases[i]["release-group"]["secondary-types"], "Live")) {
                                    $attrs.find("span.live").click();
                                    break;
                                }
                            }
                        }).fail(function () {
                            ws_requests.push(request_rec);
                        });
                    }
                    ws_requests.push(request_rec);
                }
            }
        }

    })();

    // Load works

    var works_load_cache = [],
        work_mbids = [],
        work_titles = [],
        work_disambigs = [],
        norm_work_titles = [],
        loaded_artists = [];

    function load_works_init() {
        var artists_string = localStorage.getItem("bpr_artists " + artist_mbid);
        var artists = [];

        if (artists_string) {
            artists = artists_string.split("\n");
        }

        function callback() {
            if (artists.length > 0) {
                var parts = artists.pop(),
                    mbid = parts.slice(0, 36),
                    name = parts.slice(36);

                if (mbid && name) {
                    load_artist_works(mbid, name, callback);
                }
            }
        }
        load_artist_works(artist_mbid, artist_name, callback);
    }

    function load_artist_works(mbid, name, callback) {
        if (loaded_artists.indexOf(mbid) !== -1)
            return false;
        loaded_artists.push(mbid);

        var $table_row = $("<tr></tr>"),
            $button_cell = $("<td></td>").css("display", "none");

        if (mbid === artist_mbid) {
            var $msg = $artist_works_msg;
        } else {
            var $msg = $("<td></td>");

            $button_cell.append(
                style_buttons($("<button>Remove</button>"))
                    .click(function () {
                        $table_row.remove();
                        remove_artist_works(mbid);
                    }));
        }

        var $reload = style_buttons($("<button>Reload</button>"))
            .click(function () {
                $button_cell.css("display", "none");
                $msg.text("Loading works for " + name + "...");
                load();
            })
            .prependTo($button_cell);

        $msg.text("Loading works for " + name + "...").css("color", "green"),
        $table_row.append($msg, $button_cell);
        $("tr#bpr-works-row").css("display", "none").before($table_row);

        var works_date = localStorage.getItem("bpr_works_date " + mbid);
        var result = [];

        function finished(result) {
            var parsed = load_works_finish(result);
            update_artist_works_msg($msg, result.length, name, works_date);
            $button_cell.css("display", "table-cell");
            $("tr#bpr-works-row").css("display", "table-row");

            if (callback) {
                callback();
                callback = false;
            }
            match_works(parsed[0], parsed[1], parsed[2], parsed[3]);
        }

        if (works_date) {
            var works_string = localStorage.getItem("bpr_works " + mbid);
            if (works_string) {
                finished(works_string.split("\n"));
                return true;
            }
        }

        load();
        function load() {
            works_date = new Date().toString();
            localStorage.setItem("bpr_works_date " + mbid, works_date);
            result = [];

            var callback = function (loaded, remaining) {
                result.push.apply(result, loaded);
                if (remaining > 0) {
                    $msg.text("Loading " + remaining.toString() + " works for " + name + "...");
                } else {
                    localStorage.setItem("bpr_works " + mbid, result.join("\n"));
                    finished(result);
                }
            };

            var works_url = "/ws/2/work?artist=" + mbid + "&inc=aliases&limit=50&fmt=json";
            ws_requests.unshift(function () {
                request_works(works_url, 0, -1, callback);
            });
        }
        return true;
    }

    function load_works_finish(result) {
        var tmp_mbids = [];
        var tmp_titles = [];
        var tmp_disambigs = [];
        var tmp_norm_titles = [];

        for (var i = 0; i < result.length; i++) {
            var parts = result[i];
            var mbid = parts.slice(0, 36);
            var index = work_mbids.indexOf(mbid);

            if (index !== -1) {
                work_mbids.splice(index, 1);
                work_titles.splice(index, 1);
                norm_work_titles.splice(index, 1);
            }
            var rest = parts.slice(36).split("\u00a0");
            var title = rest[0];
            var disambig = rest[1] || "";
            var norm_title = normalizeTitle(title);

            work_mbids.push(mbid);
            work_titles.push(title);
            work_disambigs.push(disambig);
            norm_work_titles.push(norm_title);
            tmp_mbids.push(mbid);
            tmp_titles.push(title);
            tmp_disambigs.push(disambig);
            tmp_norm_titles.push(norm_title);
        }
        return [tmp_mbids, tmp_titles, tmp_disambigs, tmp_norm_titles];
    }

    function request_works(url, offset, count, callback) {
        $.get(url + "&offset=" + offset, function (data, textStatus, jqXHR) {
            if (count < 0) {
                count = data['work-count'];
            }

            var works = data.works;
            var loaded = [];

            _.each(works, function (work) {
                var comment = work.disambiguation;
                loaded.push(work.id + work.title + (comment ? "\u00a0" + comment : ""));
            });

            callback(loaded, count - offset - works.length);

            if (works.length + offset < count) {
                ws_requests.unshift(function () {
                    request_works(url, offset + 50, count, callback);
                });
            }
        }).fail(function () {
            ws_requests.unshift(function () {
                request_works(url, offset, count, callback);
            });
        });
    }

    function match_works(mbids, titles, disambigs, norm_titles) {
        if (!mbids.length) {
            return;
        }

        var $not_performed = $recordings.filter(":not(.performed)");
        if (!$not_performed.length) {
            return;
        }

        var sim = function (r, w) {
            return r==w?0:_.str.levenshtein(r,w)/((r.length+w.length)/2);
        }, matches = {};

        var to_recording = function ($rec, rec_title) {
            if (rec_title in matches) {
                var match = matches[rec_title];
                suggested_work_link($rec, match[0], match[1], match[2], match[3]);
                return;
            }

            var $progress = $("<span></span>");
            rowTitleCell($rec).append(
                $('<div class="suggested-work"></div>').append(
                    $("<span>Looking for matching work…</span>"), "&#160;", $progress)
                        .css({"font-size": "0.9em", "padding": "0.3em", "padding-left": "1em", "color": "orange"}));

            var current = 0, foo = {}, total = mbids.length;
            foo.minscore = 0.250001;
            foo.match = null;

            var done = function () {
                var match = foo.match;
                if (match !== null) {
                    matches[rec_title] = match;
                    suggested_work_link($rec, match[0], match[1], match[2], match[3]);
                } else {
                    $progress.parent().remove();
                }
            };

            var iid = setInterval(function () {
                var j = current++;
                var norm_work_title = norm_titles[j];
                var score = sim(rec_title, norm_work_title);

                if (current % 12 === 0) {
                    $progress.text(current.toString() + "/" + total.toString());
                }

                if (score < foo.minscore) {
                    foo.match = [mbids[j], titles[j], disambigs[j], norm_work_title];
                    if (score === 0) {
                        clearInterval(iid);
                        done();
                        return;
                    }
                    foo.minscore = score;
                }
                if (j === total - 1) {
                    clearInterval(iid);
                    done();
                }
            }, 0);
        };

        for (var i = 0; i < $not_performed.length; i++) {
            var $rec = $not_performed.eq(i);
            var mbid = $rec.find(TITLE_SELECTOR).attr("href").match(MBID_REGEX)[0];

            to_recording($rec, RECORDING_TITLES[mbid]);
        }
    }

    function suggested_work_link($rec, mbid, title, disambig, norm_title) {
        var $title_cell = rowTitleCell($rec);
        $title_cell.children("div.suggested-work").remove();
        $title_cell.append(
            $('<div class="suggested-work"></div>').append(
                $("<span>Suggested work:</span>").css({"color": "green", "font-weight": "bold"}), "&#160;",
                $("<a></a>")
                    .attr("href", "/work/" + mbid)
                    .text(title),
                    (disambig ? "&#160;" : null),
                    (disambig ? $("<span></span>").text("(" + disambig + ")") : null))
                .css({"font-size": "0.9em", "padding": "0.3em", "padding-left": "1em"}));
        $rec.data("suggested_work_mbid", mbid);
        $rec.data("suggested_work_title", title);
    }

    function remove_artist_works(mbid) {
        var index = loaded_artists.indexOf(mbid);
        if (index === -1) {
            return;
        }
        loaded_artists.splice(index, 1);

        var artists = localStorage.getItem("bpr_artists " + artist_mbid).split("\n");
        var new_artists = [];

        for (var i = 0; i < artists.length; i++) {
            var _mbid = artists[i].slice(0, 36);
            if (_mbid !== mbid)
                new_artists.push(_mbid + artists[i].slice(36));
        }

        var artists_string = new_artists.join("\n");
        localStorage.setItem("bpr_artists " + artist_mbid, artists_string)
    }

    function cache_work(mbid, title, disambig) {
        work_mbids.push(mbid);
        work_titles.push(title);
        work_disambigs.push(disambig);
        works_load_cache.push(mbid + title + (disambig ? "\u00a0" + disambig : ""));

        var norm_title = normalizeTitle(title);
        norm_work_titles.push(norm_title);

        var works_date = localStorage.getItem("bpr_works_date " + artist_mbid);
        var count = $artist_works_msg.data("works_count") + 1;

        update_artist_works_msg($artist_works_msg, count, artist_name, works_date);
        match_works([mbid], [title], [disambig], [norm_title]);
    }

    function flush_work_cache() {
        if (!works_load_cache.length) {
            return;
        }
        var works_string = localStorage.getItem("bpr_works " + artist_mbid);
        if (works_string) {
            works_string += "\n" + works_load_cache.join("\n");
        } else {
            works_string = works_load_cache.join("\n");
        }
        localStorage.setItem("bpr_works " + artist_mbid, works_string);
        works_load_cache = [];
    }

    function load_artist_works_btn() {
        var $input = $("#bpr-load-artist");

        if (!$input.data("selected")) {
            return;
        }

        var mbid = $input.data("mbid");
        var name = $input.data("name");

        if (load_artist_works(mbid, name, false)) {
            var artists_string = localStorage.getItem("bpr_artists " + artist_mbid);
            if (artists_string) {
                artists_string += "\n" + mbid + name;
            } else {
                artists_string = mbid + name;
            }
            localStorage.setItem("bpr_artists " + artist_mbid, artists_string);
        }
    }

    function update_artist_works_msg($msg, count, artist_name, works_date) {
        $msg
            .html("")
            .append(
                count + " works loaded for " + artist_name + "<br/>",
                $('<span>(cached ' + works_date + ')</span>').css({"font-size": "0.8em"})
            )
            .data("works_count", count);
    }

    // Edit creation

    $("#bpr-work-type").val($.cookie("bpr_work_type") || 0)
        .change(function () {
            $.cookie('bpr_work_type', this.value, { path: '/', expires: 1000 });
        });

    $("#bpr-work-language").val($.cookie("bpr_work_language") || 0)
        .change(function () {
            $.cookie('bpr_work_language', this.value, { path: '/', expires: 1000 });
        });

    function relate_all_to_work(mbid, title, disambig, callback) {
        var $rows = checked_recordings();
        var total = $rows.length;

        if (!total) {
            if (callback) {
                callback();
            }
            return;
        }

        for (var i = 0; i < total; i++) {
            if (i === total - 1) {
                var _callback = callback;
            } else {
                var _callback = false;
            }
            var $row = $($rows[i]);
            $row.children("td").not(":has(input)").first()
                .css("color", "LightSlateGray")
                .find("a").css("color", "LightSlateGray");

            relate_to_work($row, mbid, title, disambig, false, _callback, false);
        }

        var index = work_mbids.indexOf(mbid);
        if (index === -1) {
            cache_work(mbid, title, disambig);
            flush_work_cache();
        }
    }

    function relate_to_new_titled_work() {
        var $rows = checked_recordings();
        var total = $rows.length;
        var title = $("#bpr-new-work").val();

        if (!total || !title) {
            return;
        }

        ws_requests.stopped = true;

        var $button = $(this).attr("disabled", true).css("color", "#EAEAEA");

        function callback() {
            ws_requests.stopped = false;
            ws_requests.start_queue();
            $button.attr("disabled", false).css("color", "#565656");
        }

        create_new_work(title, function (data) {
            var work = data.match(/\/work\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
            relate_all_to_work(work[1], title, "", callback);
        });
    }

    function relate_to_existing_work() {
        var $input = $("input#bpr-existing-work");
        var $button = $(this);

        function callback() {
            ws_requests.stopped = false;
            ws_requests.start_queue();
            $button.attr("disabled", false).css("color", "#565656");
        }

        if ($input.data("selected")) {
            ws_requests.stopped = true;
            $button.attr("disabled", true).css("color", "#EAEAEA");
            relate_all_to_work(
                $input.data("mbid"),
                $input.data("name"),
                $input.data("disambig") || "",
                callback
            );
        } else {
            $input.css("background", "#ffaaaa");
        }
    }

    function relate_to_new_works() {
        var $rows = checked_recordings();
        var total_rows = $rows.length;

        if (!total_rows) {
            return;
        }

        ws_requests.stopped = true;

        var $button = $(this)
                .attr("disabled", true)
                .css("color", "#EAEAEA");

        $.each($rows, function (i, row) {
            var $row = $(row);
            var $title_cell = rowTitleCell($row);
            var title = $title_cell.find(TITLE_SELECTOR).text();

            $title_cell.css("color", "LightSlateGray").find("a").css("color", "LightSlateGray");

            create_new_work(title, function (data) {
                total_rows -= 1;
                if (total_rows === 0) {
                    var _callback = function () {
                        flush_work_cache();
                        ws_requests.stopped = false;
                        ws_requests.start_queue();
                        $button.attr("disabled", false).css("color", "#565656");
                    };
                } else {
                    var _callback = false;
                }
                var work = data.match(/\/work\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
                relate_to_work($row, work[1], title, "", true, _callback, true);
            });
        });
    }

    function create_new_work(title, callback) {
        function post_edit() {
            var data = "edit-work.name=" + title;
            var work_type = $("#bpr-work-type").val();
            var work_lang = $("#bpr-work-language").val();

            if (work_type) data += "&edit-work.type_id=" + work_type;
            if (work_lang) data += "&edit-work.language_id=" + work_lang;

            $.post("/work/create", data, callback).fail(function () {
                edit_requests.unshift(post_edit);
            });
        }
        edit_requests.push(post_edit);
    }

    function relate_to_suggested_works() {
        var $rows = checked_recordings().filter(function () {
            return $(this).data("suggested_work_mbid");
        });

        var total = $rows.length;
        if (!total) {
            return;
        }

        ws_requests.stopped = true;

        $button = $(this)
                .attr("disabled", true)
                .css("color", "#EAEAEA");

        function callback() {
            ws_requests.stopped = false;
            ws_requests.start_queue();
            $button.attr("disabled", false).css("color", "#565656");
        };

        $.each($rows, function (i, row) {
            var $row = $(row);
            var mbid = $row.data("suggested_work_mbid");
            var title = $row.data("suggested_work_title");
            var $title_cell = rowTitleCell($row);

            $title_cell.css("color", "LightSlateGray").find("a").css("color", "LightSlateGray");

            if (i === total - 1) {
                var _callback = callback;
            } else {
                var _callback = false;
            }
            relate_to_work($row, mbid, title, "", false, _callback, false);
        });
    }

    function add_work_link($row, mbid, title, disambig, attrs) {
        var $title_cell = rowTitleCell($row);
        $title_cell.children("div.suggested-work").remove();
        $row.removeData("suggested_work_mbid").removeData("suggested_work_title");
        $title_cell
            .removeAttr("style")
            .append($('<div class="work"></div>')
            .text(attrs.join(' ') + " recording of ")
            .css({"font-size": "0.9em", "padding": "0.3em", "padding-left": "1em"})
            .append($("<a></a>").attr("href", "/work/" + mbid).text(title),
                (disambig ? "&#160;" : null),
                (disambig ? $("<span></span>").text("(" + disambig + ")") : null)));
    }

    function relate_to_work($row, work_mbid, work_title, work_disambig, check_loaded, callback, priority) {
        var performances = $row.data("performances");
        if (performances) {
            if (performances.indexOf(work_mbid) === -1) {
                performances.push(work_mbid);
            } else {
                if (callback) {
                    callback();
                }
                return;
            }
        } else {
            $row.data("performances", [work_mbid]);
        }

        var rec_mbid = $row.find(TITLE_SELECTOR).attr("href").match(MBID_REGEX)[0];
        var $title_cell = rowTitleCell($row);
        var title_link = $title_cell.children("a")[0];
        var $attrs = $row.children("td.bpr_attrs");
        var selectedAttrs = [];

        function selected(attr) {
            var checked = $attrs.children("span." + attr).data("checked") ? 1 : 0;
            if (checked) {
                selectedAttrs.push(attr);
            }
            return checked;
        }

        var data = {
            "rel-editor.rels.0.action": "add",
            "rel-editor.rels.0.link_type": "278",
            "rel-editor.rels.0.entity.1.type": "work",
            "rel-editor.rels.0.entity.1.gid": work_mbid,
            "rel-editor.rels.0.entity.0.type": "recording",
            "rel-editor.rels.0.entity.0.gid": rec_mbid
        };

        var attrs = [];
        if (selected("live")) attrs.push("70007db6-a8bc-46d7-a770-80e6a0bb551a");
        if (selected("partial")) attrs.push("d2b63be6-91ec-426a-987a-30b47f8aae2d");
        if (selected("instrumental")) attrs.push("c031ed4f-c9bb-4394-8cf5-e8ce4db512ae");
        if (selected("cover")) attrs.push("1e8536bd-6eda-3822-8e78-1c0f4d3d2113");

        _.each(attrs, function (attr, index) {
            data["rel-editor.rels.0.attributes." + index + ".type.gid"] = attr;
        });

        var date = $attrs.data("date");
        if (date != null) {
            data["rel-editor.rels.0.period.begin_date.year"] = date["year"];
            data["rel-editor.rels.0.period.begin_date.month"] = date["month"] || "";
            data["rel-editor.rels.0.period.begin_date.day"] = date["day"] || "";
            data["rel-editor.rels.0.period.end_date.year"] = date["year"];
            data["rel-editor.rels.0.period.end_date.month"] = date["month"] || "";
            data["rel-editor.rels.0.period.end_date.day"] = date["day"] || "";
        }

        function post_edit() {
            $(title_link).css("color", "green");

            $.post('/relationship-editor', data, function () {
                add_work_link($row, work_mbid, work_title, work_disambig, selectedAttrs);

                $(title_link).removeAttr("style");
                $row.addClass("performed");

                if (hide_performed_recs) {
                    $row.find("input[name=add-to-merge]").attr("checked", false);
                    $row.hide();
                    restripeRows();
                }

                if (callback) {
                    callback();
                }
            }).fail(function () {
                edit_requests.unshift(post_edit);
            });
        }
        if (priority) {
            edit_requests.unshift(post_edit);
        } else {
            edit_requests.push(post_edit);
        }

        if (check_loaded) {
            var index = work_mbids.indexOf(work_mbid);
            if (index === -1) {
                cache_work(work_mbid, work_title, work_disambig);
            }
        }
    }

    function filter_recordings() {
        var string = this.value.toLowerCase();

        for (var i = 0; i < $recordings.length; i++) {
            var $rec = $recordings.eq(i);
            var title = $rec.find(TITLE_SELECTOR).text().toLowerCase();

            if (title.indexOf(string) !== -1) {
                $rec.data("filtered", false);
                if (!hide_performed_recs || !$rec.hasClass("performed")) {
                    $rec.show();
                }
            } else {
                $rec.hide().data("filtered", true);
            }
        }
        restripeRows();
    }

    function toggle_performed_recordings() {
        var $performed = $recordings.filter(".performed");
        hide_performed_recs = this.checked;

        if (hide_performed_recs) {
            $performed.find("input[name=add-to-merge]").attr("checked", false);
            $performed.hide();
        } else {
            $performed.filter(function () { return !$(this).data("filtered") }).show();
        }
        restripeRows();
        $.cookie('hide_performed_recs', hide_performed_recs.toString(), { path: '/', expires: 1000 });
    }

    function toggle_pending_edits(event, checked) {
        var $pending = $recordings.filter(function () {
            return $(this).find(TITLE_SELECTOR).parent().parent().is("span.mp");
        });
        hide_pending_edits = checked !== undefined ? checked : this.checked;

        if (hide_pending_edits) {
            $pending.find("input[name=add-to-merge]").attr("checked", false);
            $pending.hide();
        } else {
            $pending.filter(function () { return !$(this).data("filtered") }).show();
        }
        restripeRows();
        $.cookie('hide_pending_edits', hide_pending_edits.toString(), { path: '/', expires: 1000 });
    }
    toggle_pending_edits(null, hide_pending_edits);

    function checked_recordings() {
        return $recordings
            .filter(":visible")
            .filter(function () { return $(this).find("input[name=add-to-merge]:checked").length });
    }

    function entity_lookup($input, entity) {
        $input.bind("input", function () {
            var match = this.value.match(MBID_REGEX);
            $(this).data("selected", false);
            if (match) {
                var mbid = match[0];
                ws_requests.unshift(function () {
                    $.get("/ws/2/" + entity + "/" + mbid + "?fmt=json", function (data) {
                        var value = data.title || data.name;
                        var disambig = data.disambiguation;
                        var data = {"selected": true, "mbid": mbid, "name": value};

                        if (entity === "work" && disambig) {
                            data["disambig"] = disambig;
                        }

                        $input.val(value).data(data).css("background", "#bbffbb");
                    }).fail(function () {
                        $input.css("background", "#ffaaaa");
                    });
                });
            } else {
                $input.css("background", "#ffaaaa");
            }
        }).data("selected", false);

        return $input;
    }

    function restripeRows() {
        $recordings.filter(":visible").each(function (index, row) {
            var even = (index + 1) % 2 === 0;
            row.className = row.className.replace(even ? 'odd' : 'even', even ? 'even' : 'odd');
        });
    }

    function rowTitleCell($row) {
        return $row.children('td:has(' + TITLE_SELECTOR + ')');
    }

    function RequestManager(rate, count) {
        this.queue = [];
        this.last = 0;
        this.active = false;
        this.stopped = false;

        this.next = function () {
            if (this.stopped || !this.queue.length) {
                this.active = false;
                return;
            }
            this.queue.shift()();
            this.last = new Date().getTime();

            current_reqs += count;
            if (current_reqs >= 10) {
                var diff = current_reqs - 9, timeout = diff * 1000;
                setTimeout(function (foo) { foo.next() }, rate + timeout, this);
            } else {
                setTimeout(function (foo) { foo.next() }, rate, this);
            }
        }

        this.push = function (req) {
            this.queue.push(req);
            if (!(this.active || this.stopped)) {
                this.start_queue();
            }
        }

        this.unshift = function (req) {
            this.queue.unshift(req);
            if (!(this.active || this.stopped)) {
                this.start_queue();
            }
        }

        this.start_queue = function () {
            if (this.active) {
                return;
            }
            this.active = true;
            this.stopped = false;
            var now = new Date().getTime();
            if (now - this.last >= rate) {
                this.next();
            } else {
                var timeout = rate - now + this.last;
                setTimeout(function (foo) { foo.next() }, timeout, this);
            }
        }
    }
}