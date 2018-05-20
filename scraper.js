var fs = require("fs");
var queryString = require('query-string');
var kanjidate = require('kanjidate');
var Feed = require('feed');
var xpath = require('xpath');
var xmldom = require('xmldom').DOMParser;
var tidy = require('tidy-html5').tidy_html5;
var fetch = require('node-fetch');

var sitestub = "http://www.courts.go.jp";
var stub = "http://www.courts.go.jp/app/hanrei_jp/list1?";

var maxInFeed = 50;
var monthsToBacktrack = 1;

if (process.argv[2]) {
    monthsToBacktrack = parseInt(process.argv[2], 10);
    if (isNaN(monthsToBacktrack)) {
        console.log("First argument must be empty or a number");
        process.exit();
    }
}

console.log("Backtracking " + monthsToBacktrack + " month(s)");

// Utility for zenkaku numbers

var zenkakuNum = function () {
	var zenkakuNums = ["\uff10", "\uff11", "\uff12", "\uff13", "\uff14", "\uff15", "\uff16", "\uff17", "\uff18", "\uff19"];
    var zenkakuRexes = [];
    var zenkakuAnyNum = [];
	for (var i=0,ilen=zenkakuNums.length; i<ilen; i++) {
		zenkakuRexes.push(new RegExp(zenkakuNums[i], "g"));
        zenkakuAnyNum.push(zenkakuNums[i]);
	}
    zenkakuAnyNum.push("[0-9]{1,2}");
    var zenkakuRex = new RegExp("(?:(" + zenkakuAnyNum.join("|") + ")\u3000)");
	return {
        rexes: zenkakuRexes,
        rex: zenkakuRex
    }
}();

// Set up feeds

function openFeed(category, jcategory) {
    var feed = new Feed({
        title: "日本の判例：" + jcategory + "事件",
        description: "courts.go.jpを基としたフェード：" + jcategory + "編",
        feedLinks: {
            atom: "https://our.law.nagoya-u.ac.jp/feeds/japan-courts-" + category.toLowerCase() + ".atom"
        },
        link: "http://www.courts.go.jp/app/hanrei_jp/search1",
        id: "http://www.courts.go.jp/app/hanrei_jp/search1#" + category.toLowerCase()
    });
    feed.addCategory("Japan");
    feed.addCategory("Law");
    feed.addCategory("Courts");
    feed.addCategory(category);
    return feed;
}

var feedInfoSet = {
    "Civil": {
        ja: "民事",
        cache: {}
    },
    "Criminal": {
        ja: "刑事",
        cache: {}
    },
    "IP": {
        ja: "知的財産",
        cache: {}
    },
    "Labor": {
        ja: "労働",
        cache: {}
    },
    "Administrative": {
        ja: "行政",
        cache: {}
    }
}

var feeds = {}
for (var enKey in feedInfoSet) {
    feeds[enKey] = openFeed(enKey, feedInfoSet[enKey].ja);
}

function loadFeedCache() {
    for (var enKey in feedInfoSet) {
        var feedFileName = "japan-courts-" + enKey.toLowerCase() + ".atom";
        if (fs.existsSync(feedFileName)) {
            console.log("Loading feed from existing file " + feedFileName);
            var xmlTxt = fs.readFileSync(feedFileName).toString();
            xmlTxt = xmlTxt.replace('xmlns="http://www.w3.org/2005/Atom"', "");
            var doc = new xmldom().parseFromString(xmlTxt);
            var entryNodes = xpath.select("//entry", doc);
            for (var entryNode of entryNodes) {
                var id = xpath.select(".//id", entryNode)[0].textContent;
                var title = xpath.select(".//title", entryNode)[0].textContent;
                var decisionDate = new Date(xpath.select(".//updated", entryNode)[0].textContent);
                var url = xpath.select(".//link", entryNode)[0].getAttribute("href");
                var descriptionNode = xpath.select(".//summary", entryNode)[0];
                var description = null;
                if (descriptionNode) {
                    description = descriptionNode.textContent.trim();
                    var lst = description.split("\n");
                    for (var i=0,ilen=lst.length;i<ilen;i++) {
                        lst[i] = lst[i].replace(new RegExp("^" + zenkakuNum.rex.source), "《$1》\u3000");
                    }
                    description = lst.join("\n");
                }
                var params = getItemParams(title, description, url, decisionDate)
                feedInfoSet[enKey].cache[id] = params;
            }
        } else {
            console.log("Oops, no existing feed file found for " + feedFileName);
        }
    }
}

loadFeedCache();


// Classification data
var codes = {
  "オ": "Civil",
  "受": "Civil",
  "許": "Civil",
  "行ツ": "Administrative",
  "行ヒ": "Administrative",
  "行フ": "Administrative",
  "あ": "Criminal",
  "し": "Criminal",
  "医へ": "Civil",
  "き": "Criminal",
  "行チ": "Administrative",
  "行テ": "Administrative",
  "行ト": "Administrative",
  "行ナ": "Administrative",
  "行ニ": "Administrative",
  "ク": "Civil",
  "さ": "Criminal",
  "収と": "Criminal",
  "収へ": "Criminal",
  "す": "Criminal",
  "せ": "Criminal",
  "秩ち": "All",
  "秩と": "All",
  "テ": "Civil",
  "ひ": "Criminal",
  "分": "All",
  "分ク": "All",
  "マ": "Civil",
  "み": "Criminal",
  "め": "Criminal",
  "も": "Criminal",
  "ヤ": "Civil",
  "ゆ": "Criminal",
  "れ": "Criminal",
  "ネ": "Civil",
  "ラ": "Civil",
  "行ケ": "Administrative",
  "行コ": "Administrative",
  "行ス": "Administrative",
  "う": "Criminal",
  "く": "Criminal",
  "医ほ": "Civil",
  "ウ": "Civil",
  "お": "Criminal",
  "行ウ": "Administrative",
  "行サ": "Administrative",
  "行シ": "Administrative",
  "行セ": "Administrative",
  "行ソ": "Administrative",
  "行タ": "Administrative",
  "行ノ": "Administrative",
  "行ハ": "Administrative",
  "け": "Criminal",
  "収に": "Criminal",
  "収ほ": "Criminal",
  "人ウ": "Civil",
  "人ナ": "Civil",
  "秩に": "All",
  "秩へ": "All",
  "秩ほ": "All",
  "ツ": "Civil",
  "ツテ": "Civil",
  "て": "Criminal",
  "ネオ": "Civil",
  "ネ受": "Civil",
  "の": "Criminal",
  "ふ": "Criminal",
  "ま": "Criminal",
  "ム": "Civil",
  "や": "Criminal",
  "ら": "Criminal",
  "ラ許": "Civil",
  "ラク": "Civil",
  "ワ": "Civil",
  "わ": "Criminal",
  "を": "Criminal",
  "レ": "Civil",
  "家ホ": "Civil",
  "カ": "Civil",
  "行": "Administrative",
  "行オ": "Administrative",
  "行ク": "Administrative",
  "刑わ": "Criminal",
  "合わ": "Criminal",
  "サ": "Civil",
  "人": "Civil",
  "少イ": "Criminal",
  "少エ": "Civil",
  "少コ": "Civil",
  "ソ": "Civil",
  "た": "Criminal",
  "タ": "Civil",
  "手ワ": "Civil",
  "特わ": "Criminal",
  "ハ": "Civil",
  "ほ": "Criminal",
  "ホ": "Civil",
  "モ": "Civil",
  "ヨ": "Civil",
  "ろ": "Criminal",
  "え": "Criminal",
  "か": "Criminal",
  "そ": "Criminal",
  "つ": "Criminal",
  "と": "Criminal",
  "な": "Criminal",
  "ぬ": "Criminal",
  "ね": "Criminal",
  "は": "Criminal",
  "へ": "Criminal",
  "む": "Criminal",
  "よ": "Criminal",
  "る": "Criminal",
  "ア": "All",
  "ナ": "Administrative",
  "ニ": "Civil",
  "ヒ": "Civil",
  "フ": "Civil",
  "ヘ": "Civil",
  "ミ": "Civil",
  "モ甲": "Civil",
  "ヲ": "Civil",
  "家ヘ": "Civil",
  "医に": "Civil",
  "医は": "Civil",
  "医ろ": "Civil",
  "抗": "All",
  "控": "All",
  "控訴": "All",
  "収ろ": "Criminal",
  "少テ": "Criminal",
  "上": "Criminal",
  "上告": "Criminal",
  "新": "Criminal",
  "選": "Administrative",
  "損": "Civil",
  "秩ろ": "All",
  "日": "Criminal",
  "配チ": "Criminal",
  "労": "Civil"
}

// Date functions for scraper

Date.prototype.addDays = function(days) {
    var dat = new Date(this.valueOf());
    dat.setDate(dat.getDate() + days);
    return dat;
}

function getBackDates() {
    var from = new Date();
    var to = new Date();
    return {
        from: from.addDays(monthsToBacktrack * 30 * -1),
        to: from.addDays((monthsToBacktrack -1) * 30 * -1),
    }
}

function convertImperialDate(dateStr) {
	var eraOffsetMap = {
		"\u660E\u6CBB": 1867,
		"\u5927\u6B63": 1911,
		"\u662D\u548C": 1925,
		"\u5e73\u6210": 1988
	};
	// 元年
	dateStr = dateStr.replace("\u5143\u5E74", "1\u5E74");
	for (var i=0,ilen=zenkakuNum.rexes.length; i<ilen; i++) {
		dateStr = dateStr.replace(zenkakuNum.rexes[i], i);
	}
	// 明治|大正|昭和|平成...年...月...日
	var m = dateStr.match(/(\u660E\u6CBB|\u5927\u6B63|\u662D\u548c|\u5e73\u6210)([0-9]+)\u5e74(?:([0-9]+)(?:\u6708([0-9]+)\u65e5)*)*/);
	if (m) {
		var era = m[1];
		var year = (parseInt(m[2], 10) + eraOffsetMap[m[1]]);
		if (!isNaN(year)) {
			var dateStr = [year, m[3], m[4]]
				.filter(function(elem){
					return elem;
				}).map(function(elem){
					while (elem.length < 2) {
						elem = "0" + elem;
					}
					return elem;
				}).join("-");
		}
	}
	return dateStr;
}

function getKanjiDatePart(partCode, date) {
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    var day = date.getDate();
    return kanjidate.format(partCode, year, month, day);
}

// Labelled value from page for scraper

function getTextByLabel(doc, label) {
    //console.log(doc.toString())
    var valueNode = xpath.select("//div[contains(@class, 'list4')][contains(text(),\'" + label + "\')]/following-sibling::div", doc)[0];
    if (valueNode) {
        return valueNode.textContent.replace(/\&thinsp;/g, "").trim();
    } else {
        return "";
    }
}

// Param functions for scraper

function getDateParams() {
    var backDates = getBackDates(monthsToBacktrack);
    var fromDate = backDates.from;
    var toDate = backDates.to;
    return {
        fromG: getKanjiDatePart("{G}", fromDate),
        toG: getKanjiDatePart("{G}", toDate),
        fromN: getKanjiDatePart("{N}", fromDate),
        toN: getKanjiDatePart("{N}", toDate),
        fromM: getKanjiDatePart("{M}", fromDate),
        toM: getKanjiDatePart("{M}", toDate),
        fromD: getKanjiDatePart("{D}", fromDate),
        toD: getKanjiDatePart("{D}", toDate)
    }
}

function getQuery(params, page) {
    var querySrc = { action_search: '検索',
                     page: page,
                     sort: '1',
                     'filter[branchName]': '',
                     'filter[courtName]': '',
                     'filter[courtType]': '',
                     'filter[jikenCode]': '',
                     'filter[jikenGengo]': '',
                     'filter[jikenNumber]': '',
                     'filter[jikenYear]': '',
                     'filter[judgeDateMode]': '2',
                     'filter[judgeDayFrom]': params.fromD,
                     'filter[judgeDayTo]': params.toD,
                     'filter[judgeGengoFrom]': params.fromG,
                     'filter[judgeGengoTo]': params.toG,
                     'filter[judgeMonthFrom]': params.fromM,
                     'filter[judgeMonthTo]': params.toM,
                     'filter[judgeYearFrom]': params.fromN,
                     'filter[judgeYearTo]': params.toN,
                     'filter[text1]': '',
                     'filter[text2]': '',
                     'filter[text3]': '',
                     'filter[text4]': '',
                     'filter[text5]': '',
                     'filter[text6]': '',
                     'filter[text7]': '',
                     'filter[text8]': '',
                     'filter[text9]': ''
                   }
    return queryString.stringify(querySrc);
}

// Scraper

function getDocument(txt) {
    // Clean up and cast as DOM
    var html = tidy(txt, {});
    html = html.split("\n");
    if (html[0].indexOf("!") > -1) {
        html = html.slice(1);
    }
    html = html.join("\n");
    html = html.replace(/<\![^>]*>/g, "");
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, "");
    html = html.replace(/\&nbsp;/g, " ");
    html = html.replace(/\&thinsp;/g, "");
    html = html.replace(/xml:lang=\"ja\"/g, "");
    html = html.replace(/lang=\"ja\"/g, "");
    html = html.replace(/xmlns=\"http:\/\/www.w3.org\/1999\/xhtml\"/g, "");
    var document = new xmldom().parseFromString(html);
    return document;
}

function getItemParams (title, description, url, decisionDate) {
    return {
        title: title,
        description: description,
        link: url,
        id: url,
        date: decisionDate
    }
}

async function runItem(url, category) {
    url = sitestub + url;
    var res = await fetch(url)
    var txt = await res.text();
    var doc =  getDocument(txt);
    var title = [];
    var decisionDate = new Date(convertImperialDate(getTextByLabel(doc, "裁判年月日")));
    var court = getTextByLabel(doc, "裁判所名・部");
    if (!court) {
        court = getTextByLabel(doc, "法廷名");
    }
    if (!court) {
        court = getTextByLabel(doc, "裁判所名");
    }
    if (court) {
        title.push(court.replace(/　/g, " ").split("\n").join(" ").replace(/\s+/g, " ").trim());
    }
    var docketNumber = getTextByLabel(doc, "事件番号");
    title.push(docketNumber);

    var subject = getTextByLabel(doc, "事件名");
    title.push(subject.replace(/　/g, " ").split("\n").join(" ").replace(/\s+/g, " ").trim());
    title = title.filter(function(elem){
        return elem;
    }).join(" / ");
    var description = getTextByLabel(doc, "判示事項");
    var params = getItemParams(title, description, url, decisionDate);
    var categories = [];
    if (category) {
        categories.push(category)
    } else {
        if (docketNumber) {
            var m = docketNumber.match(/^[^\(]+\(([^\)]+)\)/);
            if (m) {
                if (codes[m[1]]) {
                    if (codes[m[1]] === "All") {
                        categories = Object.keys(feedInfoSet);
                    } else {
                        categories.push(codes[m[1]]);
                    }
                }
            }
        }
        if (categories.length === 0) {
            console.log("Ooops, didn't find nothing");
            console.log(JSON.stringify(params, null, 2));
            categories = Object.keys(feedInfoSet);
        }
    }
    for (var category of categories) {
        if (!feedInfoSet[category].cache[params.id]) {
            feedInfoSet[category].cache[params.id] = params;
        }
    }
}

async function addItemsToFeed(doc) {
    // doc here is one page of the search listing
    // Search results contain a category hint (for IP, Labor and Administrative cases)
    // that may be missing in the item page proper, so we sniff for that here
    var itemNodes = xpath.select("//table[contains(@class, 'waku')]//td[1]", doc);
    for (var i=0,ilen=itemNodes.length;i<ilen;i++) {
        var itemNode = itemNodes[i];
        var anchorNodes = xpath.select(".//a", itemNode);
        if (anchorNodes.length) {
            var url = anchorNodes[0].getAttribute('href');
            var category = null;
            for (var anchorNode of anchorNodes) {
                var anchorText = anchorNode.textContent;
                if (anchorText.match(/知的財産/)) {
                    category = "IP";
                    break;
                } else if (anchorText.match(/労働事件/)) {
                    category = "Labor";
                    break;
                } else if (anchorText.match(/行政事件/)) {
                    category = "Administrative";
                    break;
                }
            }
            await runItem(url, category);
        }
    }
}

function stripCache(cache) {
    var lst = [];
    for (var id of Object.keys(cache)) {
        lst.push(cache[id]);
    }
    lst.sort(function(a, b){
        if (a.date > b.date) {
            return -1;
        } else if (a.date < b.date) {
            return 1;
        } else {
            return 0;
        }
    });
    return lst.slice(0, maxInFeed);
}

function outputFeeds() {
    for (var enKey in feedInfoSet) {
        var feedFileName = "japan-courts-" + enKey.toLowerCase() + ".atom";
        var feed = feeds[enKey];
        var cache = feedInfoSet[enKey].cache;
        var feedItems = stripCache(cache);
        // console.log("XXX "+enKey);
        // console.log(JSON.stringify(feedItems, null, 2))
        for (var params of feedItems) {
            feed.addItem(params);
        }
        console.log("Writing to feed: " + feedFileName);
        fs.writeFileSync(feedFileName, feed.atom1());
    }
}

async function runGetter(urlGetter, page) {
    // Gets a given page of the search return and calls function to add its items to the feeds
    console.log("  parsing page " + page + " of search return");
    var url = urlGetter(page);
    var res = await fetch(url);
    var txt = await res.text();
    var doc =  getDocument(txt);
    var linkNode = xpath.select("//a[contains(@class, 'header_link')][contains(text(), '次へ')]", doc)[0];
    await addItemsToFeed(doc);
    if (linkNode) {
        page = page+1;
        await runGetter(urlGetter, page);
    } else {
        outputFeeds();
    }
}

function getUrlGetter(params) {
    // Generate function that returns a URL for the desired range at a given page
    return function(page) {
        var query = getQuery(params, page);
        return stub + query;
    }
}

function getPages() {
    // Initial call
    // Runs a search for all cases over some interval, ending on today's date
    // Return is paginated, we begin viewing from page 1
    var params = getDateParams();
    var urlGetter = getUrlGetter(params);
    runGetter(urlGetter, 1);
}

getPages();
