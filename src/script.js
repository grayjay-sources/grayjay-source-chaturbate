const PLATFORM = "Chaturbate";
const PLATFORM_SHORT = "CU";


class Url {
    constructor(input, base = undefined) {
        if (!input && !base) {
            throw new TypeError('At least one of input or base must be provided');
        }
        let urlStr = String(input);
        if (base) {
            urlStr = this._resolveRelativeUrl(urlStr, base);
        }
        const parsed = this._parseUrl(urlStr);
        this.protocol = parsed.protocol;
        this.hostname = parsed.hostname;
        this.port = parsed.port;
        this.pathname = parsed.pathname;
        this.search = parsed.search;
        this.hash = parsed.hash;
        this.username = parsed.username;
        this.password = parsed.password;
        this.searchParams = new URLSearchParams(this.search);
    }
    toString() {
        return this.href;
    }
    get href() {
        const usernamePassword = this._buildUsernamePassword();
        const port = this._buildPort();
        let search = this.searchParams.toString();
        search = search ? `?${search}` : '';
		if (search === "?=") search = '';
        let hash = this.hash || '';
        if (hash === "#") hash = '';
        return `${this.protocol}//${usernamePassword}${this.hostname}${port}${this.pathname}${search}${hash}`;
    }
    set href(value) {
        const url = new Url(value);
        Object.assign(this, {
            protocol: url.protocol,
            hostname: url.hostname,
            pathname: url.pathname,
            search: url.search,
            hash: url.hash,
            username: url.username,
            password: url.password,
            port: url.port
        });
        this.searchParams = new URLSearchParams(url.search);
    }
    _parseUrl(urlStr) {
        const matches = urlStr.match(/^([a-z]+):\/\/([^\/@]+@)?([^:/?#]+)(:\d+)?(.*?)(#.*)?$/i);
        
        if (!matches) {
            throw new TypeError(`Invalid URL: ${urlStr}`);
        }

        const [, protocol, auth, hostname, portMatch, pathQueryHash, hash] = matches;

        let username, password;
        if (auth) {
            [username, password] = auth.slice(0, -1).split(':');
        }

        return {
            protocol: protocol.toLowerCase() + ':',
            hostname: hostname.split('/')[0],
            pathname: '/' + hostname.split('/').slice(1).join('/') + pathQueryHash.split('?')[0].split('#')[0],
            search: '?' + (pathQueryHash.split('?')[1] || '').split('#')[0],
            hash: '#' + (hash || ''),
            username,
            password,
            port: portMatch ? portMatch.slice(1) : ''
        };
    }
    _resolveRelativeUrl(urlStr, base) {
        const baseUrl = new Url(base);
        if (urlStr.startsWith('/')) {
            return `${baseUrl.protocol}//${baseUrl.hostname}${urlStr}`;
        }
        const basePathParts = baseUrl.pathname.split('/');
        const relPathParts = urlStr.split('/');
        const resolvedPath = [...basePathParts.slice(0, -1), ...relPathParts].reduce((acc, part) => {
            if (part === '..') acc.pop();
            else if (part !== '' && part !== '.') acc.push(part);
            return acc;
        }, []);
        return `${baseUrl.protocol}//${baseUrl.hostname}/${resolvedPath.join('/')}`;
    }
    _buildUsernamePassword() {
        if (!this.username) return '';
        const password = this.password ? `:${this.password}` : '';
        return `${this.username}${password}@`;
    }
    _buildPort() {
        if (!this.port) return '';
        return `:${this.port}`;
    }
    addParams(params) {
		let url = new Url(this.toString());
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.append(key, value);
        }
        return url;
    }
    setParams(params) {
		let url = new Url(this.toString());
        url.searchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }
        return url;
    }
    addPaths(...segments) {
		let url = new Url(this.toString());
        if (segments.length === 1 && Array.isArray(segments[0])) {
            segments = segments[0];
        }
        const pathParts = segments.map(segment => encodeURIComponent(segment));
        url.pathname = '/' + pathParts.join('/');
        return url;
    }
    static canParse(input, base) {
        try {
            new Url(input, base);
            return true;
        } catch (e) {
            return false;
        }
    }
}

const URL_BASE = new Url("https://chaturbate.com/");

const URL_API_POPULAR = URL_BASE.addPaths("api","ts","discover","carousels","most_popular"); // ?genders=

const URL_API_TRENDING = URL_BASE.addPaths("api","ts","discover","carousels","trending"); // ?genders=
const URL_API_ROOMS = URL_BASE.addPaths("api","ts","roomlist","room-list"); // ?limit=90&offset=0

const REGEX_CHANNEL_URL = /https:\/\/chaturbate\.com\/(\w+)/gm;

var config = {
	"limit_rooms": 90
};
var settings = {
	"limit_rooms": config["limit_rooms"]
};
var state = {
	"limit_rooms": config["limit_rooms"]
};

// region Utils
class Utils {
	isNullOrEmpty = function (obj) {
		return obj === undefined || obj === null || obj === "" || this.isObjectEmpty(obj);
	}
	isObjectEmpty(obj) {
		return obj !== null && Object.keys(obj).length === 0;
	}
	timestamp = function(date) {
		date = date ?? new Date();
		return `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}:${date.getSeconds().toString().padStart(2,'0')}.${date.getMilliseconds().toString().padStart(3,'0')}`;
	}
	log = function(...args) {
		let msg = `[${PLATFORM_SHORT}] [${this.timestamp()}]`;
		for (const arg of args) {
			msg += " " + JSON.stringify(arg, null, 4); // arg.toString()
		}
		console.log(msg);
		bridge.log(msg);
		bridge.toast(msg);
	}
	error = function(...args) {
		this.log(...args);	
	}
	get = function (url_s, headers = {}, name = null) {
		url_s = Array.isArray(url_s) ? url_s : [url_s];
		name = name ?? PLATFORM_SHORT;
		for (let url of url_s) {
			// try {
				this.log(`GET ${url}`);
				const response = http.GET(url.toString(), headers);
				log(response);
				if (!response.isOk) {
					this.error(`Failed to get ${url} [${response.code}]`);
				}
				return response;
			// } catch (error) {
			// 	this.error(`Error fetching video info: \"${url}\"`, error, true);
			// }
		}
		this.error(`${url_s.length} URLs failed to fetch`);
	}
	getJson = function (url_s, headers = {}, name = null) {
		headers["Accept"] = "application/json"
		const response = this.get(url_s, headers, name);
		
		return JSON.parse(response.body);
	}
}
// endregion Utils
const utils = new Utils();
utils.log("script.js START");

// region Parsing
function getPlatformId(id) {
	return new PlatformID(PLATFORM, id.toString(), config.id);
}
// function parseDate(date) {
// 	parseInt((new Date(date)).getTime() / 1000)
// }
function parseGender(gender) {
    switch(gender?.toLowerCase()) {
        case "m": return "Male";
        case "f": return "Female";
    }
	return gender;
}
function parseThumbnailVariations(roomInfo) {
	return new Thumbnails([new Thumbnail(roomInfo.img, null)]);
}
function parseAuthor(roomInfo) {
	return new PlatformAuthorLink(
		getPlatformId(roomInfo.username),
		`${roomInfo.username} (${parseGender(roomInfo.gender)})`,
		URL_BASE.addPaths([roomInfo.username]).toString(),
		roomInfo.img, // todo: improve
		null
	);
}
// endregion Parsing

// region METHODS
source.setSettings = function (settings) {
	_settings = utils.isNullOrEmpty(settings) ? _settings : settings;
}
source.enable = function(_config, _settings, _savedState){
	utils.log(`source.enable(${_config}, ${_settings}, ${_savedState})`);
	config = utils.isNullOrEmpty(_config) ? config : _config;
	settings = utils.isNullOrEmpty(_settings) ? settings : _settings;
	state = utils.isNullOrEmpty(_savedState) ? state : _savedState;
	return `Successfully enabled source ${PLATFORM} at ${utils.timestamp()} on ${bridge.buildFlavor},${bridge.buildSpecVersion},${bridge.buildVersion}`;
}
source.disable = function (conf, settings, savedState) {
	utils.log(`source.disable(${conf}, ${settings}, ${savedState})`);
	return `Successfully disabled source ${PLATFORM} at ${utils.timestamp()} on ${bridge.buildFlavor},${bridge.buildSpecVersion},${bridge.buildVersion}`;
}
source.getHome = function() {
	utils.log("source.getHome()");
	return new ContentPager(getVideoResults(0), true);
};

class HomePager extends VideoPager {
	constructor(initialResults, hasMore) {
		super(initialResults, hasMore);
		this.offset = 0;
	}

	nextPage() {
		this.offset += settings["limit_rooms"];
		utils.log(`requested next page, setting offset to ${this.offset}`);
		this.results = getVideoResults(this.offset);
		this.hasMore = true;
		return this;
	}
}

function getVideoResults(offset) {
	let params = { "limit": settings["limit_rooms"], "offset": offset };
	let url = URL_API_ROOMS.setParams(params);
	const rooms = utils.getJson(url).rooms;
	return rooms.map(
		x => {
			const room = parseAuthor(x);
			return new PlatformVideo({
			id: getPlatformId(x.username),
			name: x.subject,
			thumbnails: parseThumbnailVariations(x),
			author: room,
			datetime: x.start_timestamp,
			// duration: -1,
			viewCount: x.viewers,
			url: room.url,
			// shareUrl: x.short_url,
			isLive: true
		})
	})
}

source.searchSuggestions = function(query) {
	utils.log(`source.searchSuggestions(${query})`);
	throw new ScriptException("This is a sample");
};
source.getSearchCapabilities = () => {
	utils.log("source.getSearchCapabilities()");
	return {
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: [ ]
	};
};
source.search = function (query, type, order, filters) {
	utils.log(`source.search(${query}, ${type}, ${order}, ${filters})`);
	return new ContentPager([]. false);
};
source.getSearchChannelContentsCapabilities = function () {
	utils.log("source.getSearchChannelContentsCapabilities()");
	return {
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: []
	};
};
source.searchChannelContents = function (channelUrl, query, type, order, filters) {
	utils.log(`source.searchChannelContents(${channelUrl}, ${query}, ${type}, ${order}, ${filters})`);
	throw new ScriptException("This is a sample");
};

source.searchChannels = function (query) {
	utils.log(`source.searchChannels(${query})`);
	throw new ScriptException("This is a sample");
};

//Channel
source.isChannelUrl = function(url) {
	utils.log(`source.isChannelUrl(${url})`);
	return url.match(REGEX_CHANNEL_URL);
};
source.getChannel = function(url) {
	utils.log(`source.getChannel(${url})`);
	throw new ScriptException("This is a sample");
};
source.getChannelContents = function(url) {
	throw new ScriptException("This is a sample");
};

//Video
source.isContentDetailsUrl = function(url) {
	utils.log(`source.isContentDetailsUrl(${url})`);
	throw new ScriptException("This is a sample");
};
source.getContentDetails = function(url) {
	utils.log(`source.getContentDetails(${url})`);
	throw new ScriptException("This is a sample");
};

//Comments
source.getComments = function (url) {
	utils.log(`source.getComments(${url})`);
	throw new ScriptException("This is a sample");

}
source.getSubComments = function (comment) {
	utils.log(`source.getSubComments(${comment})`);
	throw new ScriptException("This is a sample");
}

// endregion METHODS

utils.log("script.js END");