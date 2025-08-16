const PLATFORM = "Chaturbate";
const PLATFORM_SHORT = "CU";

const REGEX_PATTERNS = {
	urls: {
		roomStandard: /^https?:\/\/(?:www\.)?chaturbate\.com\/([a-zA-Z0-9_-]+)\/?$/,
		roomWithSlash: /^https?:\/\/(?:www\.)?chaturbate\.com\/([a-zA-Z0-9_-]+)\/$/,
		roomMobile: /^https?:\/\/(?:m\.)?chaturbate\.com\/([a-zA-Z0-9_-]+)\/?$/,
		roomInternal: /^chaturbate:\/\/room\/([a-zA-Z0-9_-]+)$/,
		liveStream: /^https?:\/\/(?:www\.)?chaturbate\.com\/([a-zA-Z0-9_-]+)\/live\/?$/,
		liveStreamMobile: /^https?:\/\/(?:m\.)?chaturbate\.com\/([a-zA-Z0-9_-]+)\/live\/?$/,
		profileStandard: /^https?:\/\/(?:www\.)?chaturbate\.com\/profile\/([a-zA-Z0-9_-]+)\/?$/,
		profileMobile: /^https?:\/\/(?:m\.)?chaturbate\.com\/profile\/([a-zA-Z0-9_-]+)\/?$/,
		tagStandard: /^https?:\/\/(?:www\.)?chaturbate\.com\/tag\/([a-zA-Z0-9_-]+)\/?$/,
		tagMobile: /^https?:\/\/(?:m\.)?chaturbate\.com\/tag\/([a-zA-Z0-9_-]+)\/?$/
	},
	extraction: {
		roomIdFromUrl: /chaturbate\.com\/([a-zA-Z0-9_-]+)/,
		roomIdStandard: /\/([a-zA-Z0-9_-]+)\/?$/,
		roomIdInternal: /room\/([a-zA-Z0-9_-]+)/,
		profileId: /\/profile\/([a-zA-Z0-9_-]+)/,
		tagId: /\/tag\/([a-zA-Z0-9_-]+)/
	},
	parsing: {
		htmlTags: /<[^>]*>/g,
		htmlBreaks: /<br\s*\/?>/gi,
		htmlEntities: /&[a-zA-Z0-9#]+;/g
	},
	csrf: {
		middlewareToken: /name="csrfmiddlewaretoken"\s+value="([^"]+)"/,
		jsonToken: /"csrf_token"\s*:\s*"([^"]+)"/,
		jsonCsrf: /"csrf"\s*:\s*"([^"]+)"/,
		windowToken: /window\.csrf_token\s*=\s*"([^"]+)"/,
		windowCsrfToken: /window\.CSRF_TOKEN\s*=\s*"([^"]+)"/
	},
	url: {
		parseUrl: /^([a-z]+):\/\/([^\/@]+@)?([^:/?#]+)(:\d+)?(.*?)(#.*)?$/i
	},
	streams: {
		m3u8Url: /https:\/\/[^"'\s]*\.m3u8[^"'\s]*/g
	},
	pageData: {
		initialData: /window\.initialData\s*=\s*({.*?});/,
		initialState: /window\.__INITIAL_STATE__\s*=\s*({.*?});/,
		roomData: /window\.roomData\s*=\s*({.*?});/
	},
	tracking: {
		xNewRelicId: /"X-NewRelic-ID"\s*:\s*"([^"]+)"/,
		newrelic: /"newrelic"\s*:\s*"([^"]+)"/,
		traceparent: /"traceparent"\s*:\s*"([^"]+)"/,
		tracestate: /"tracestate"\s*:\s*"([^"]+)"/,
		windowNewrelic: /window\.newrelic\s*=\s*"([^"]+)"/,
		windowTraceparent: /window\.traceparent\s*=\s*"([^"]+)"/,
		windowTracestate: /window\.tracestate\s*=\s*"([^"]+)"/
	}
};

class CustomUrl {
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
		// Ensure pathname doesn't have trailing slash (except for root)
		let cleanPathname = this.pathname;
		if (cleanPathname !== '/' && cleanPathname.endsWith('/')) {
			cleanPathname = cleanPathname.slice(0, -1);
		}
		return `${this.protocol}//${usernamePassword}${this.hostname}${port}${cleanPathname}${search}${hash}`;
	}
	set href(value) {
		const url = new CustomUrl(value);
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
		const matches = urlStr.match(REGEX_PATTERNS.url.parseUrl);

		if (!matches) {
			throw new TypeError(`Invalid URL: ${urlStr}`);
		}

		const [, protocol, auth, hostname, portMatch, pathQueryHash, hash] = matches;

		let username, password;
		if (auth) {
			[username, password] = auth.slice(0, -1).split(':');
		}

		// Extract pathname and clean it up
		let pathname = pathQueryHash.split('?')[0].split('#')[0];
		// Ensure pathname starts with / and doesn't have double slashes
		if (!pathname.startsWith('/')) {
			pathname = '/' + pathname;
		}
		// Remove any trailing slash except for root path
		if (pathname !== '/' && pathname.endsWith('/')) {
			pathname = pathname.slice(0, -1);
		}

		return {
			protocol: protocol.toLowerCase() + ':',
			hostname: hostname.split('/')[0],
			pathname: pathname,
			search: '?' + (pathQueryHash.split('?')[1] || '').split('#')[0],
			hash: '#' + (hash || ''),
			username,
			password,
			port: portMatch ? portMatch.slice(1) : ''
		};
	}
	_resolveRelativeUrl(urlStr, base) {
		const baseUrl = new CustomUrl(base);
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
		let url = new CustomUrl(this.toString());
		for (const [key, value] of Object.entries(params)) {
			url.searchParams.append(key, value);
		}
		// Ensure no trailing slash is added to the pathname
		if (url.pathname !== '/' && url.pathname.endsWith('/')) {
			url.pathname = url.pathname.slice(0, -1);
		}
		return url;
	}
	setParams(params) {
		let url = new CustomUrl(this.toString());
		url.searchParams = new URLSearchParams();
		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}
		// Ensure no trailing slash is added to the pathname
		if (url.pathname !== '/' && url.pathname.endsWith('/')) {
			url.pathname = url.pathname.slice(0, -1);
		}
		return url;
	}
	addPaths(...segments) {
		let url = new CustomUrl(this.toString());
		if (segments.length === 1 && Array.isArray(segments[0])) {
			segments = segments[0];
		}
		const pathParts = segments.map(segment => encodeURIComponent(segment));

		// Combine existing pathname with new segments
		const existingPath = url.pathname === '/' ? '' : url.pathname;
		const newPath = existingPath + '/' + pathParts.join('/');

		// Clean up the pathname - ensure it starts with / and remove trailing slash
		let cleanPath = newPath.startsWith('/') ? newPath : '/' + newPath;
		if (cleanPath !== '/' && cleanPath.endsWith('/')) {
			cleanPath = cleanPath.slice(0, -1);
		}

		url.pathname = cleanPath;
		return url;
	}
	static canParse(input, base) {
		try {
			new CustomUrl(input, base);
			return true;
		} catch (e) {
			return false;
		}
	}
}

const URL_BASE = new CustomUrl("https://chaturbate.com/");
const URL_API_ROOMS = URL_BASE.addPaths("api", "ts", "roomlist", "room-list");
const URL_API_BIO_CONTEXT = URL_BASE.addPaths("api", "biocontext");
const URL_API_PANEL_CONTEXT = URL_BASE.addPaths("api", "panel_context");
const URL_HLS_AJAX = URL_BASE.addPaths("get_edge_hls_url_ajax");

// Default headers for all requests
const DEFAULT_HEADERS = {
	'Host': 'chaturbate.com',
	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0',
	'Accept': 'application/json, text/plain, */*',
	'Accept-Language': 'en-US,en;q=0.5',
	'Accept-Encoding': '',
	'Referer': 'https://chaturbate.com/',
	'X-Requested-With': 'XMLHttpRequest',
	'Sec-Fetch-Dest': 'empty',
	'Sec-Fetch-Mode': 'cors',
	'Sec-Fetch-Site': 'same-origin',
	'DNT': '1',
	'Sec-GPC': '1',
	'Connection': 'keep-alive'
};

// Headers for page requests (different Accept and Sec-Fetch-Dest)
const PAGE_HEADERS = {
	...DEFAULT_HEADERS,
	'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
	'Sec-Fetch-Dest': 'document',
	'Sec-Fetch-Mode': 'navigate',
	'Sec-Fetch-Site': 'none'
};

// Headers for HLS AJAX requests (specific headers from reference)


var sourceConfig = {
};
var sourceSettings = {
	"limit_rooms": 90,
	"log_to_console": false,
	"log_to_bridge": false,
	"log_to_toast": false
};
var sourceState = {
};

class SourceUtils {
	isNullOrEmpty = function (obj) {
		return obj === undefined || obj === null || obj === "" || this.isObjectEmpty(obj);
	}
	isObjectEmpty(obj) {
		return obj !== null && obj !== undefined && Object.keys(obj).length === 0;
	}
	timestamp = function (date) {
		date = date ?? new Date();
		return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}`;
	}
	log = function (...args) {
		let msg = `[${PLATFORM_SHORT}] [${this.timestamp()}]`;
		for (const arg of args) {
			msg += " " + JSON.stringify(arg, null, 4);
		}
		if (!sourceSettings || sourceSettings.log_to_console) console.log(msg);
		if (!sourceSettings || sourceSettings.log_to_bridge) bridge.log(msg);
		if (!sourceSettings || sourceSettings.log_to_toast) bridge.toast(msg);
	}
	error = function (...args) {
		this.log(...args);
	}

	// Extract CSRF token from response body and cache it
	extractAndCacheCsrfToken = function (response) {
		if (!response || !response.body) return;

		try {
			// Look for CSRF token in various formats
			let csrfToken = null;

			// Define CSRF patterns with descriptive names
			const csrfPatterns = [
				{ name: 'middleware token', pattern: REGEX_PATTERNS.csrf.middlewareToken },
				{ name: 'JSON token', pattern: REGEX_PATTERNS.csrf.jsonToken },
				{ name: 'JSON csrf', pattern: REGEX_PATTERNS.csrf.jsonCsrf },
				{ name: 'window token', pattern: REGEX_PATTERNS.csrf.windowToken },
				{ name: 'window CSRF token', pattern: REGEX_PATTERNS.csrf.windowCsrfToken }
			];

			// Try each pattern until we find a match
			csrfPatterns.forEach(({ name, pattern }) => {
				if (!csrfToken) {
					const match = response.body.match(pattern);
					if (match) {
						csrfToken = match[1];
						this.log(`Found CSRF token using ${name} pattern`);
					}
				}
			});

			if (csrfToken) {
				this.getCached("header", "csrf", csrfToken);
			}
		} catch (e) {
			this.log(`Failed to extract CSRF token: ${e.message}`);
		}
	}

	// Extract NewRelic and tracking headers from response and cache them
	extractAndCacheTrackingHeaders = function (response) {
		if (!response || !response.body) return;

		try {
			// Look for NewRelic and tracking data in response body using REGEX_PATTERNS
			const trackingPatterns = [
				{ name: 'x-newrelic-id', pattern: REGEX_PATTERNS.tracking.xNewRelicId },
				{ name: 'newrelic', pattern: REGEX_PATTERNS.tracking.newrelic },
				{ name: 'traceparent', pattern: REGEX_PATTERNS.tracking.traceparent },
				{ name: 'tracestate', pattern: REGEX_PATTERNS.tracking.tracestate },
				{ name: 'newrelic', pattern: REGEX_PATTERNS.tracking.windowNewrelic },
				{ name: 'traceparent', pattern: REGEX_PATTERNS.tracking.windowTraceparent },
				{ name: 'tracestate', pattern: REGEX_PATTERNS.tracking.windowTracestate }
			];

			trackingPatterns.forEach(({ name, pattern }) => {
				const match = response.body.match(pattern);
				if (match) {
					this.getCached("header", name, match[1]);
				}
			});

			// Also try to extract from response headers if available
			if (response.headers) {
				const headerNames = ['x-newrelic-id', 'newrelic', 'traceparent', 'tracestate'];

				headerNames.forEach(headerName => {
					const headerValue = response.headers[headerName] || response.headers[headerName.charAt(0).toUpperCase() + headerName.slice(1)];
					if (headerValue) {
						this.getCached("header", headerName, headerValue);
					}
				});
			}
		} catch (e) {
			this.log(`Failed to extract tracking headers: ${e.message}`);
		}
	}

	// Get cached CSRF token
	getCsrfToken = function () {
		return this.getCached("header", "csrf");
	}

	// Generic cached value getter/setter
	getCached = function (type, key, newValue = null) {
		const stateKey = `${type}-${key}`;

		// If newValue is provided, cache it
		if (newValue !== null) {
			sourceState[stateKey] = newValue;
			this.log(`Cached ${type} ${key}: ${newValue.substring(0, 8)}...`);
			return newValue;
		}

		// Return cached value or default
		return sourceState[stateKey] || null;
	}

	// Get cached tracking headers
	getTrackingHeaders = function () {
		return {
			'X-NewRelic-ID': this.getCached("header", "x-newrelic-id") || 'VQIGWV9aDxACUFNVDgMEUw==',
			'newrelic': this.getCached("header", "newrelic") || 'eyJ2IjpbMCwxXSwiZCI6eyJ0eSI6IkJyb3dzZXIiLCJhYyI6IjE0MTg5OTciLCJhcCI6IjI0NTA2NzUwIiwiaWQiOiI1M2YzOWVhZmVlMTllYzE1IiwidHIiOiI0NDhiZmNjNzI3MDg1NTRiNDFlMjc3MDk0ZTAzOWJlNSIsInRpIjoxNzU1MzU1ODg4OTE4fX0=',
			'traceparent': this.getCached("header", "traceparent") || '00-448bfcc72708554b41e277094e039be5-53f39eafee19ec15-01',
			'tracestate': this.getCached("header", "tracestate") || '1418997@nr=0-1-1418997-24506750-53f39eafee19ec15----1755355888918'
		};
	}
	get = function (url_s, headers = {}, name = null) {
		url_s = Array.isArray(url_s) ? url_s : [url_s];
		name = name ?? PLATFORM_SHORT;
		for (let url of url_s) {
			const response = http.GET(url.toString(), headers);
			sourceUtils.log(`[${name}] GET \"${url}\": ${response.code}`);
			sourceUtils.log(response);

			// Always try to extract CSRF token and tracking headers from response
			this.extractAndCacheCsrfToken(response);
			this.extractAndCacheTrackingHeaders(response);

			if (!response.isOk) {
				this.throwIfCaptcha(response);
				this.error(`Failed to get ${url} [${response.code}]`);
			}
			return response;
		}
		this.error(`${url_s.length} URLs failed to fetch`);
	}
	getJson = function (url_s, headers = {}, name = null) {
		headers["Accept"] = "application/json"
		const response = this.get(url_s, headers, name);
		return JSON.parse(response.body);
	}
	post = function (url, data, headers = {}, name = null) {
		name = name ?? PLATFORM_SHORT;
		const response = http.POST(url.toString(), data, headers);
		sourceUtils.log(`[${name}] POST \"${url}\": ${response.code}`);
		sourceUtils.log(response);

		// Always try to extract CSRF token and tracking headers from response
		this.extractAndCacheCsrfToken(response);
		this.extractAndCacheTrackingHeaders(response);

		if (!response.isOk) {
			this.throwIfCaptcha(response);
			this.error(`Failed to post ${url} [${response.code}]`);
		}
		return response;
	}
	postJson = function (url, data, headers = {}, name = null) {
		headers["Accept"] = "application/json";
		headers["Content-Type"] = "application/json";
		const response = this.post(url, JSON.stringify(data), headers, name);
		return JSON.parse(response.body);
	}
	postForm = function (url, formData, headers = {}, name = null) {
		name = name ?? PLATFORM_SHORT;
		headers["Content-Type"] = "application/x-www-form-urlencoded";
		const response = http.POST(url.toString(), formData, headers);
		sourceUtils.log(`[${name}] POST FORM \"${url}\": ${response.code}`);
		sourceUtils.log(response);

		// Always try to extract CSRF token and tracking headers from response
		this.extractAndCacheCsrfToken(response);
		this.extractAndCacheTrackingHeaders(response);

		if (!response.isOk) {
			this.throwIfCaptcha(response);
			this.error(`Failed to post form ${url} [${response.code}]`);
		}
		return response;
	}
	throwIfCaptcha = function (resp) {
		if (resp != null && resp.body != null && resp.code == 403) {
			const body = resp.body.toLowerCase();
			if (body.includes('/cdn-cgi/challenge-platform')) {
				let body = resp.body;
				if (body && body.length > 255) {
					body = body.substring(0, 255) + '...';
				}
				throw new CaptchaRequiredException(resp.url, body);
			}
		}
		return true;
	}
	cleanHtmlContent = function (content) {
		if (!content || typeof content !== 'string') {
			return content;
		}
		return content
			.replace(REGEX_PATTERNS.parsing.htmlTags, '')
			.replace(REGEX_PATTERNS.parsing.htmlBreaks, '\n')
			.replace(REGEX_PATTERNS.parsing.htmlEntities, '')
			.trim();
	}
}

const sourceUtils = new SourceUtils();
sourceUtils.log("script.js START");

// Function to get HLS AJAX headers with cached tracking data
function getHlsAjaxHeaders() {
	const trackingHeaders = sourceUtils.getTrackingHeaders();
	return {
		...DEFAULT_HEADERS,
		'Accept': '*/*',
		'Referer': 'https://chaturbate.com/get_edge_hls_url_ajax/',
		'X-NewRelic-ID': trackingHeaders['X-NewRelic-ID'],
		'newrelic': trackingHeaders['newrelic'],
		'traceparent': trackingHeaders['traceparent'],
		'tracestate': trackingHeaders['tracestate'],
		'Content-Type': 'multipart/form-data; boundary=----geckoformboundary1101d51d68a8e9a18e9b7beb548eeaa5',
		'Origin': 'https://chaturbate.com',
		'Pragma': 'no-cache',
		'Cache-Control': 'no-cache',
		'TE': 'trailers'
	};
}

// Function to get bio context headers with cached tracking data
function getBioContextHeaders() {
	const trackingHeaders = sourceUtils.getTrackingHeaders();
	return {
		...DEFAULT_HEADERS,
		'Accept': '*/*',
		'Referer': 'https://chaturbate.com/',
		'X-NewRelic-ID': trackingHeaders['X-NewRelic-ID'],
		'newrelic': trackingHeaders['newrelic'],
		'traceparent': trackingHeaders['traceparent'],
		'tracestate': trackingHeaders['tracestate'],
		'Origin': 'https://chaturbate.com',
		'Pragma': 'no-cache',
		'Cache-Control': 'no-cache',
		'TE': 'trailers'
	};
}

function getPlatformId(id) {
	return new PlatformID(PLATFORM, id.toString(), sourceConfig.id);
}

function parseGender(gender) {
	switch (gender?.toLowerCase()) {
		case "m": return "Male";
		case "f": return "Female";
	}
	return gender;
}

function parseThumbnailVariations(roomInfo) {
	return new Thumbnails([new Thumbnail(roomInfo.img, null)]);
}

function parseAuthor(roomInfo) {
	// Use rich data from bio context API if available
	let displayName = roomInfo.username;
	let gender = parseGender(roomInfo.gender);

	// If we have real_name from bio context, use it
	if (roomInfo.real_name) {
		displayName = roomInfo.real_name;
	}

	// If we have sex from bio context, use it for better gender parsing
	if (roomInfo.sex) {
		gender = roomInfo.sex;
	}

	// Build a rich author name
	let authorName = displayName;
	if (gender && gender !== displayName) {
		authorName += ` (${gender})`;
	}

	// Add follower count if available
	if (roomInfo.num_followers > 0) {
		authorName += ` • ${roomInfo.num_followers.toLocaleString()} followers`;
	}

	return new PlatformAuthorLink(
		getPlatformId(roomInfo.username),
		authorName,
		URL_BASE.addPaths(roomInfo.username).toString(),
		roomInfo.img,
		null
	);
}

function extractRoomSlug(url) {
	const patterns = [
		REGEX_PATTERNS.extraction.roomIdFromUrl,
		REGEX_PATTERNS.extraction.roomIdStandard,
		REGEX_PATTERNS.extraction.roomIdInternal
	];

	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match && match[1]) {
			return match[1];
		}
	}

	throw new ScriptException(`Could not extract room slug from URL: ${url}`);
}

function getHlsStreamUrl(roomSlug) {
	try {
		// First, get the room page to extract CSRF token and establish session
		const roomPageUrl = URL_BASE.addPaths(roomSlug).toString();

		sourceUtils.log(`Getting room page for CSRF token: ${roomPageUrl}`);
		const pageResponse = sourceUtils.get(roomPageUrl, PAGE_HEADERS);

		if (!pageResponse.isOk) {
			throw new ScriptException(`Failed to access room page for ${roomSlug}: ${pageResponse.code}`);
		}

		// Get CSRF token from cache (automatically extracted by SourceUtils.get)
		let csrfToken = sourceUtils.getCsrfToken();
		if (csrfToken) {
			sourceUtils.log(`Using cached CSRF token: ${csrfToken.substring(0, 8)}...`);
		} else {
			sourceUtils.log(`No CSRF token available, proceeding without it`);
		}

		// Extract cookies from the page response headers
		let cookies = '';
		if (pageResponse.headers) {
			const setCookieHeaders = pageResponse.headers['set-cookie'] || pageResponse.headers['Set-Cookie'];
			if (setCookieHeaders) {
				const cookieArray = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
				cookies = cookieArray.map(cookie => cookie.split(';')[0]).join('; ');
				sourceUtils.getCached("cookie", "session", cookies);
				sourceUtils.log(`Extracted cookies: ${cookies}`);
			}
		}

		// Use cached cookies if available
		if (!cookies) {
			cookies = sourceUtils.getCached("cookie", "session");
		}

		// Use the get_edge_hls_url_ajax endpoint to get the HLS stream URL
		const headers = getHlsAjaxHeaders();

		// Add cookies if available
		if (cookies) {
			headers['Cookie'] = cookies;
		}

		// Build multipart form data matching the reference format
		const boundary = '----geckoformboundary1101d51d68a8e9a18e9b7beb548eeaa5';
		let postData = `--${boundary}\r\n`;
		postData += `Content-Disposition: form-data; name="room_slug"\r\n\r\n`;
		postData += `${roomSlug}\r\n`;
		postData += `--${boundary}\r\n`;
		postData += `Content-Disposition: form-data; name="bandwidth"\r\n\r\n`;
		postData += `high\r\n`;
		postData += `--${boundary}\r\n`;
		postData += `Content-Disposition: form-data; name="current_edge"\r\n\r\n`;
		postData += `\r\n`;
		postData += `--${boundary}\r\n`;
		postData += `Content-Disposition: form-data; name="exclude_edge"\r\n\r\n`;
		postData += `\r\n`;
		if (csrfToken) {
			postData += `--${boundary}\r\n`;
			postData += `Content-Disposition: form-data; name="csrfmiddlewaretoken"\r\n\r\n`;
			postData += `${csrfToken}\r\n`;
		}
		postData += `--${boundary}--\r\n`;

		sourceUtils.log(`Requesting HLS URL for room: ${roomSlug}`);
		sourceUtils.log(`POST data length: ${postData.length}`);

		// Try without trailing slash first
		const response = sourceUtils.post(URL_HLS_AJAX.toString() + "/", postData, headers);

		if (!response.isOk) {
			throw new ScriptException(`Failed to get HLS URL for ${roomSlug}: ${response.code}`);
		}

		sourceUtils.log(`HLS AJAX Response: ${response.body}`);
		return parseHlsResponse(response.body, roomSlug);

	} catch (error) {
		throw new ScriptException(`Failed to get HLS stream URL: ${error.message}`);
	}
}

function parseHlsResponse(responseBody, roomSlug) {
	// Parse the response to extract the HLS URL
	let hlsUrl = null;
	let roomStatus = null;

	// Try to parse as JSON first
	try {
		const jsonResponse = JSON.parse(responseBody);
		sourceUtils.log(`Parsed JSON response:`, jsonResponse);

		// Check for success field first
		if (jsonResponse.success === false) {
			throw new ScriptException(`API returned success=false for room ${roomSlug}`);
		}

		// Check room status first
		if (jsonResponse.room_status) {
			roomStatus = jsonResponse.room_status;
			sourceUtils.log(`Room ${roomSlug} status: ${roomStatus}`);

			// If room is offline, throw a specific error
			if (roomStatus === 'offline') {
				throw new ScriptException(`Room ${roomSlug} is currently offline`);
			}

			// If room is not public, log it but continue
			if (roomStatus !== 'public') {
				sourceUtils.log(`Room ${roomSlug} is not public (status: ${roomStatus})`);
			}
		}

		// Look for URL in various possible fields
		if (jsonResponse.url && jsonResponse.url.trim() !== '') {
			hlsUrl = jsonResponse.url;
		} else if (jsonResponse.hls_url && jsonResponse.hls_url.trim() !== '') {
			hlsUrl = jsonResponse.hls_url;
		} else if (jsonResponse.stream_url && jsonResponse.stream_url.trim() !== '') {
			hlsUrl = jsonResponse.stream_url;
		} else if (jsonResponse.playlist_url && jsonResponse.playlist_url.trim() !== '') {
			hlsUrl = jsonResponse.playlist_url;
		}

	} catch (e) {
		// If it's our own ScriptException, re-throw it
		if (e instanceof ScriptException) {
			throw e;
		}

		sourceUtils.log(`Response is not JSON or parsing failed: ${e.message}`);
		sourceUtils.log(`Response body: ${responseBody}`);
	}

	// If JSON parsing failed or no URL found, try to extract from response text
	if (!hlsUrl) {
		// Look for m3u8 URLs in the response
		const m3u8Matches = responseBody.match(REGEX_PATTERNS.streams.m3u8Url);
		if (m3u8Matches && m3u8Matches.length > 0) {
			hlsUrl = m3u8Matches[0];
		}
	}

	if (!hlsUrl) {
		if (roomStatus === 'offline') {
			throw new ScriptException(`Room ${roomSlug} is currently offline`);
		} else if (roomStatus) {
			throw new ScriptException(`No HLS URL found for room ${roomSlug} (status: ${roomStatus})`);
		} else {
			throw new ScriptException(`No HLS URL found in response for room ${roomSlug}. Response: ${responseBody}`);
		}
	}

	sourceUtils.log(`Found HLS URL for room ${roomSlug}: ${hlsUrl}`);
	return hlsUrl;
}

function createVideoSources(roomSlug) {
	try {
		const hlsUrl = getHlsStreamUrl(roomSlug);

		const videoSources = [
			new HLSSource({
				url: hlsUrl,
				name: "Live Stream",
				priority: true
			})
		];

		return videoSources;

	} catch (error) {
		throw new ScriptException(`Failed to create video sources: ${error.message}`);
	}
}

// region METHODS
source.setSettings = function (settings) {
	_settings = sourceUtils.isNullOrEmpty(settings) ? _settings : settings;
}

source.enable = function (_config, _settings, _savedState) {
	const msg = `Successfully enabled source ${PLATFORM} at ${sourceUtils.timestamp()} on ${bridge.buildFlavor} v${bridge.buildSpecVersion}.${bridge.buildVersion}`;
	sourceUtils.log("source.enable() called");
	sourceUtils.log("Config:", _config);
	sourceUtils.log("Settings:", _settings);
	sourceUtils.log("Saved State:", _savedState);

	sourceConfig = sourceUtils.isNullOrEmpty(_config) ? sourceConfig : _config;

	// Always ensure default settings are set, then merge with provided settings
	sourceSettings = {
		"limit_rooms": 90,
		"log_to_console": false,
		"log_to_bridge": false,
		"log_to_toast": false,
		...(_settings || {})
	};

	if (_savedState !== null && _savedState !== undefined) {
		const state = JSON.parse(_savedState);
		sourceState = state;
	} else {
		sourceState = {};
	}

	sourceUtils.log("Final sourceConfig:", sourceConfig);
	sourceUtils.log("Final sourceSettings:", sourceSettings);
	sourceUtils.log("Final sourceState:", sourceState);
	sourceUtils.log("sourceSettings limit_rooms value:", sourceSettings["limit_rooms"]);
	sourceUtils.log("sourceConfig limit_rooms value:", sourceConfig["limit_rooms"]);
	sourceUtils.log("sourceState limit_rooms value:", sourceState["limit_rooms"]);

	sourceUtils.log(msg);
	return msg;
}

source.saveState = function () {
	return JSON.stringify(sourceState);
}

source.disable = function (conf, settings, savedState) {
	sourceUtils.log("source.disable() called");
	sourceUtils.log("Config:", conf);
	sourceUtils.log("Settings:", settings);
	sourceUtils.log("Saved State:", savedState);
	return `Successfully disabled source ${PLATFORM} at ${sourceUtils.timestamp()} on ${bridge.buildFlavor},${bridge.buildSpecVersion},${bridge.buildVersion}`;
}

source.getHome = function () {
	sourceUtils.log("source.getHome() called");
	const results = getVideoResults(0);
	sourceUtils.log(`Home results: ${results.length} videos found`);
	return new ContentPager(results, true);
};

class HomePager extends VideoPager {
	constructor(initialResults, hasMore) {
		super(initialResults, hasMore);
		this.offset = 0;
	}

	nextPage() {
		const limit_rooms = sourceSettings["limit_rooms"] || 90;
		this.offset += limit_rooms;
		sourceUtils.log(`requested next page, setting offset to ${this.offset}`);
		this.results = getVideoResults(this.offset);
		this.hasMore = true;
		return this;
	}
}

function getVideoResults(offset) {
	sourceUtils.log(`getVideoResults() called with offset: ${offset}`);
	sourceUtils.log(`sourceSettings in getVideoResults:`, sourceSettings);
	sourceUtils.log(`sourceSettings["limit_rooms"]:`, sourceSettings["limit_rooms"]);

	// Ensure limit_rooms is defined with a fallback
	const limit_rooms = sourceSettings["limit_rooms"] || 90;
	let params = { "limit": limit_rooms, "offset": offset };
	let url = URL_API_ROOMS.setParams(params);
	sourceUtils.log(`API URL: ${url.toString()}`);

	const headers = { ...DEFAULT_HEADERS };

	const apiResponse = sourceUtils.getJson(url, headers);
	sourceUtils.log(`API Response total_count: ${apiResponse.total_count || 'N/A'}`);
	sourceUtils.log(`API Response rooms count: ${apiResponse.rooms ? apiResponse.rooms.length : 0}`);

	const rooms = apiResponse.rooms;

	const liveRooms = rooms.filter(room => {
		const isLive = room.current_show === 'public' || room.current_show === 'private' || room.current_show === 'spy';
		sourceUtils.log(`Room ${room.username}: current_show=${room.current_show}, isLive=${isLive}`);
		return isLive;
	});

	sourceUtils.log(`Filtered ${rooms.length} total rooms to ${liveRooms.length} live rooms`);

	return liveRooms.map(
		x => {
			const room = parseAuthor(x);
			const videoUrl = URL_BASE.addPaths(x.username).toString();
			return new PlatformVideo({
				id: getPlatformId(x.username),
				name: sourceUtils.cleanHtmlContent(x.subject),
				thumbnails: parseThumbnailVariations(x),
				author: room,
				datetime: x.start_timestamp,
				viewCount: x.num_users || 0,
				url: videoUrl,
				isLive: true
			})
		})
}

source.searchSuggestions = function (query) {
	sourceUtils.log(`source.searchSuggestions(${query})`);

	try {
		if (!query || query.trim().length === 0) {
			return [];
		}

		const tagParams = {
			"keywords": query.trim(),
			"limit": 10,
			"offset": 0
		};
		const tagUrl = URL_BASE.addPaths("api", "ts", "roomlist", "all-tags").setParams(tagParams);

		const headers = { ...DEFAULT_HEADERS };

		const tagResponse = sourceUtils.getJson(tagUrl, headers);

		const suggestions = [];
		if (tagResponse.tags && Array.isArray(tagResponse.tags)) {
			suggestions.push(...tagResponse.tags.slice(0, 5));
		}

		suggestions.unshift(query.trim());

		sourceUtils.log(`Search suggestions for "${query}":`, suggestions);
		return suggestions;

	} catch (error) {
		sourceUtils.log(`Failed to get search suggestions: ${error.message}`);
		return [query.trim()];
	}
};

source.getSearchCapabilities = () => {
	sourceUtils.log("source.getSearchCapabilities()");
	return {
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological, Type.Order.Popularity],
		filters: [
			{
				id: "gender",
				name: "Gender",
				options: [
					{ id: "f", name: "Female" },
					{ id: "m", name: "Male" },
					{ id: "s", name: "Shemale" },
					{ id: "c", name: "Couple" }
				]
			},
			{
				id: "show_type",
				name: "Show Type",
				options: [
					{ id: "public", name: "Public" },
					{ id: "private", name: "Private" },
					{ id: "spy", name: "Spy" }
				]
			}
		]
	};
};

source.search = function (query, type, order, filters, continuationToken) {
	sourceUtils.log("source.search() called");
	sourceUtils.log("Query:", query);
	sourceUtils.log("Type:", type);
	sourceUtils.log("Order:", order);
	sourceUtils.log("Filters:", filters);
	sourceUtils.log("Continuation Token:", continuationToken);

	try {
		if (!query || query.trim().length === 0) {
			throw new ScriptException("Search query cannot be empty");
		}

		const offset = continuationToken ? parseInt(continuationToken) : 0;

		const searchParams = {
			"keywords": query.trim(),
			"limit": sourceSettings["limit_rooms"],
			"offset": offset,
			"require_fingerprint": "true"
		};

		if (filters && Array.isArray(filters)) {
			filters.forEach(filter => {
				if (filter.id === "gender" && filter.value) {
					searchParams.genders = filter.value;
				}
				if (filter.id === "show_type" && filter.value) {
					searchParams.show_type = filter.value;
				}
			});
		}

		if (order === Type.Order.Popularity) {
			searchParams.sort = "popularity";
		} else {
			searchParams.sort = "chronological";
		}

		const searchUrl = URL_API_ROOMS.setParams(searchParams);

		const headers = { ...DEFAULT_HEADERS };

		const searchResponse = sourceUtils.getJson(searchUrl, headers);
		sourceUtils.log(`Search response for "${query}":`, searchResponse);

		if (!searchResponse.rooms || !Array.isArray(searchResponse.rooms)) {
			throw new ScriptException("Invalid search response format - missing rooms array");
		}

		const liveRooms = searchResponse.rooms.filter(room => {
			const isLive = room.current_show === 'public' || room.current_show === 'private' || room.current_show === 'spy';
			sourceUtils.log(`Search result room ${room.username}: current_show=${room.current_show}, isLive=${isLive}`);
			return isLive;
		});

		sourceUtils.log(`Search filtered ${searchResponse.rooms.length} total rooms to ${liveRooms.length} live rooms`);

		const videos = liveRooms.map(room => {
			const author = parseAuthor(room);
			const videoUrl = URL_BASE.addPaths(room.username).toString();
			return new PlatformVideo({
				id: getPlatformId(room.username),
				name: sourceUtils.cleanHtmlContent(room.subject),
				thumbnails: parseThumbnailVariations(room),
				author: author,
				datetime: room.start_timestamp,
				viewCount: room.num_users || 0,
				url: videoUrl,
				isLive: true
			});
		});

		const hasMore = liveRooms.length >= sourceSettings["limit_rooms"] &&
			(searchResponse.total_count ? (offset + sourceSettings["limit_rooms"]) < searchResponse.total_count : true);

		const nextToken = hasMore ? (offset + sourceSettings["limit_rooms"]).toString() : null;

		return new ChaturbateSearchContentPager(videos, hasMore, {
			query: query,
			type: type,
			order: order,
			filters: filters,
			continuationToken: nextToken,
			totalResults: searchResponse.total_count || 0,
			currentOffset: offset
		});

	} catch (error) {
		throw new ScriptException(`Failed to search: ${error.message}`);
	}
};

class ChaturbateSearchContentPager extends ContentPager {
	constructor(results, hasMore, context) {
		super(results, hasMore, context);
	}

	nextPage() {
		return source.search(
			this.context.query,
			this.context.type,
			this.context.order,
			this.context.filters,
			this.context.continuationToken
		);
	}

	getTotalResults() {
		return this.context.totalResults || 0;
	}

	getCurrentOffset() {
		return this.context.currentOffset || 0;
	}
}

class ChaturbateChannelSearchPager extends ChannelPager {
	constructor(results, hasMore, context) {
		super(results, hasMore, context);
	}

	nextPage() {
		return new ChaturbateChannelSearchPager([], false, this.context);
	}

	getTotalResults() {
		return this.context.totalResults || 0;
	}

	getQuery() {
		return this.context.query || "";
	}
}

source.getSearchChannelContentsCapabilities = function () {
	sourceUtils.log("source.getSearchChannelContentsCapabilities()");
	return {
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: []
	};
};

source.searchChannelContents = function (channelUrl, query, type, order, filters) {
	sourceUtils.log(`source.searchChannelContents(${channelUrl}, ${query}, ${type}, ${order}, ${filters})`);
	throw new ScriptException("This is a sample");
};

source.searchChannels = function (query) {
	sourceUtils.log("source.searchChannels() called");
	sourceUtils.log("Query:", query);

	try {
		if (!query || query.trim().length === 0) {
			return new ChaturbateChannelSearchPager([], false, { query: query });
		}

		const searchParams = {
			"keywords": query.trim(),
			"limit": 50,
			"offset": 0,
			"require_fingerprint": "true"
		};
		const searchUrl = URL_API_ROOMS.setParams(searchParams);

		const headers = { ...DEFAULT_HEADERS };

		const searchResponse = sourceUtils.getJson(searchUrl, headers);
		sourceUtils.log(`Channel search response for "${query}":`, searchResponse);

		if (!searchResponse.rooms || !Array.isArray(searchResponse.rooms)) {
			return new ChaturbateChannelSearchPager([], false, {
				query: query,
				error: "Invalid search response format"
			});
		}

		const channels = [];

		searchResponse.rooms.forEach(room => {
			if (room.username && room.username.toLowerCase().includes(query.toLowerCase())) {
				const channel = new PlatformChannel({
					id: getPlatformId(room.username),
					name: `${room.username} (${parseGender(room.gender)})`,
					thumbnail: room.img || "",
					banner: room.img || "",
					subscribers: room.num_followers || 0,
					description: sourceUtils.cleanHtmlContent(room.subject) || `Live performer ${room.username} on Chaturbate`,
					url: URL_BASE.addPaths(room.username).toString(),
					urlAlternatives: [
						`https://chaturbate.com/${room.username}/`,
						`https://chaturbate.com/${room.username}`
					],
					links: {
						"Chaturbate Profile": URL_BASE.addPaths(room.username).toString(),
						"Live Stream": room.current_show === 'public' ? URL_BASE.addPaths(room.username).toString() : null
					}
				});
				channels.push(channel);
			}
		});

		const uniqueChannels = channels.filter((channel, index, self) =>
			index === self.findIndex(c => c.id.value === channel.id.value)
		);

		sourceUtils.log(`Found ${uniqueChannels.length} unique channels for query "${query}"`);

		return new ChaturbateChannelSearchPager(uniqueChannels, false, {
			query: query,
			totalResults: uniqueChannels.length
		});

	} catch (error) {
		sourceUtils.log(`Channel search error: ${error.message}`);
		return new ChaturbateChannelSearchPager([], false, {
			query: query,
			error: error.message
		});
	}
};

source.isChannelUrl = function (url) {
	sourceUtils.log(`source.isChannelUrl(${url})`);

	const patterns = [
		REGEX_PATTERNS.urls.roomStandard,
		REGEX_PATTERNS.urls.roomWithSlash,
		REGEX_PATTERNS.urls.roomMobile,
		REGEX_PATTERNS.urls.roomInternal,
		REGEX_PATTERNS.urls.liveStream,
		REGEX_PATTERNS.urls.liveStreamMobile,
		REGEX_PATTERNS.urls.profileStandard,
		REGEX_PATTERNS.urls.profileMobile
	];

	return patterns.some(pattern => pattern.test(url));
};

source.getChannel = function (url) {
	sourceUtils.log(`source.getChannel(${url})`);
	throw new ScriptException("This is a sample");
};

source.getChannelContents = function (url) {
	throw new ScriptException("This is a sample");
};

source.isContentDetailsUrl = function (url) {
	if (!url || typeof url !== 'string') {
		return false;
	}

	const patterns = [
		REGEX_PATTERNS.urls.roomStandard,
		REGEX_PATTERNS.urls.roomWithSlash,
		REGEX_PATTERNS.urls.roomMobile,
		REGEX_PATTERNS.urls.roomInternal,
		REGEX_PATTERNS.urls.liveStream,
		REGEX_PATTERNS.urls.liveStreamMobile
	];

	return patterns.some(pattern => pattern.test(url));
};

source.getContentDetails = function (url) {
	sourceUtils.log("source.getContentDetails() called");
	sourceUtils.log("URL:", url);

	try {
		const roomSlug = extractRoomSlug(url);

		// Only use bio context API with enhanced headers
		let room = null;
		try {
			const bioContextUrl = URL_API_BIO_CONTEXT.addPaths(roomSlug).toString() + '/';
			sourceUtils.log(`Getting bio context data: ${bioContextUrl}`);
			const bioResponse = sourceUtils.getJson(bioContextUrl, getBioContextHeaders());
			sourceUtils.log(`Bio context API response:`, bioResponse);

			if (bioResponse) {
				// Use the rich data from bio context API
				room = {
					username: roomSlug, // bioResponse doesn't always have username field
					subject: bioResponse.real_name || bioResponse.subject || `${roomSlug}'s Live Stream`,
					img: `https://thumb.live.mmcdn.com/riw/${roomSlug}.jpg`,
					gender: bioResponse.sex || 'f',
					start_timestamp: Math.floor(Date.now() / 1000), // Current time as fallback
					num_users: 0, // Will be updated if available
					num_followers: bioResponse.follower_count || 0,
					current_show: bioResponse.room_status || 'offline',
					viewers: 0, // Will be updated if available
					// Additional rich data from bio context
					about_me: bioResponse.about_me || '',
					display_age: bioResponse.display_age || null,
					location: bioResponse.location || '',
					languages: bioResponse.languages || '',
					last_broadcast: bioResponse.last_broadcast || null,
					time_since_last_broadcast: bioResponse.time_since_last_broadcast || '',
					body_type: bioResponse.body_type || '',
					interested_in: bioResponse.interested_in || [],
					photo_sets: bioResponse.photo_sets || [],
					social_medias: bioResponse.social_medias || []
				};
				sourceUtils.log(`Found rich room data from bio context API:`, room);
			}
		} catch (e) {
			sourceUtils.log(`Bio context API failed: ${e.message}`);
		}

		// If bio context API failed, use minimal fallback
		if (!room) {
			sourceUtils.log(`Bio context API failed, using minimal fallback for room ${roomSlug}`);
			room = {
				username: roomSlug,
				subject: `${roomSlug}'s Live Stream`,
				img: `https://thumb.live.mmcdn.com/riw/${roomSlug}.jpg`,
				gender: 'f',
				start_timestamp: Math.floor(Date.now() / 1000),
				num_users: 0,
				num_followers: 0,
				current_show: 'offline',
				viewers: 0
			};
			sourceUtils.log(`Using fallback room data:`, room);
		}

		// Check if room is currently live
		const isLive = room.current_show === 'public' || room.current_show === 'private' || room.current_show === 'spy';
		if (!isLive) {
			sourceUtils.log(`Room ${roomSlug} is not currently live (current_show: ${room.current_show})`);
		}

		// Try to get video sources, but handle offline rooms gracefully
		let videoSources = [];
		try {
			videoSources = createVideoSources(roomSlug);
		} catch (error) {
			sourceUtils.log(`Failed to create video sources for room ${roomSlug}: ${error.message}`);
			// If room is offline, create a placeholder video source
			if (error.message.includes('offline')) {
				videoSources = [
					new HLSSource({
						url: `https://thumb.live.mmcdn.com/riw/${roomSlug}.jpg`,
						name: "Offline - No Stream Available",
						priority: false
					})
				];
			} else {
				// Re-throw other errors
				throw error;
			}
		}
		const thumbnails = parseThumbnailVariations(room);
		const author = parseAuthor(room);

		// Build a rich description using available data
		let description = '';
		if (room.about_me) {
			description += sourceUtils.cleanHtmlContent(room.about_me);
		}

		// Add additional metadata if available
		const metadata = [];
		if (room.location) metadata.push(`📍 ${room.location}`);
		if (room.display_age) metadata.push(`Age: ${room.display_age}`);
		if (room.languages) metadata.push(`Language: ${room.languages}`);
		if (room.body_type) metadata.push(`Body: ${room.body_type}`);
		if (room.interested_in && room.interested_in.length > 0) {
			metadata.push(`Interested in: ${room.interested_in.join(', ')}`);
		}
		if (room.time_since_last_broadcast) {
			metadata.push(`Last broadcast: ${room.time_since_last_broadcast}`);
		}
		if (room.num_followers > 0) {
			metadata.push(`${room.num_followers.toLocaleString()} followers`);
		}

		if (metadata.length > 0) {
			description += '\n\n' + metadata.join(' • ');
		}

		// Fallback description if no rich data
		if (!description.trim()) {
			description = isLive ?
				`Live stream from ${roomSlug} on Chaturbate` :
				`${roomSlug} is currently offline on Chaturbate`;
		}

		const videoDetails = new PlatformVideoDetails({
			id: getPlatformId(roomSlug),
			name: sourceUtils.cleanHtmlContent(room.subject) || `${roomSlug}'s Live Stream`,
			thumbnails: thumbnails,
			author: author,
			datetime: room.start_timestamp || Math.floor(Date.now() / 1000),
			duration: -1,
			viewCount: room.viewers || 0,
			url: url,
			sharedUrl: url,
			isLive: isLive,
			description: description,
			video: new VideoSourceDescriptor(videoSources),
			live: isLive ? videoSources[0] : null,
			subtitles: [],
			rating: null
		});

		return videoDetails;

	} catch (error) {
		throw new ScriptException(`Failed to get content details: ${error.message}`);
	}
};

source.getComments = function (url) {
	sourceUtils.log(`source.getComments(${url})`);

	try {
		const roomSlug = extractRoomSlug(url);

		// For Chaturbate, we can't easily fetch chat comments via API
		// The chat is typically WebSocket-based and requires authentication
		// Return an empty comment list with a message
		return new CommentPager([], false, {
			message: "Chat comments are not available via API. Please visit the room directly to view chat.",
			roomSlug: roomSlug
		});

	} catch (error) {
		throw new ScriptException(`Failed to get comments: ${error.message}`);
	}
}

//Live Chat
source.getLiveChatWindow = function (url) {
	sourceUtils.log(`source.getLiveChatWindow(${url})`);

	try {
		const roomSlug = extractRoomSlug(url);
		return {
			url: `https://chaturbate.com/${roomSlug}/`,
			removeElements: [
				'.scanNext',
				'[data-testid="room-bio-tab-contents"]',
				'[data-testid="room-tab-bar"]',
				".appsTab",
				".BroadcastVideoPanel",
				".chat-header",
				".chat-toolbar",
				".footer",
				".header",
				".sidebar",
				".video-container-wrapper",
				".video-container",
				".video-js",
				".video-player-container-wrapper",
				".video-player-container",
				".video-player-wrapper",
				".video-player",
				".video-wrapper",
				"#footer-holder",
				"#shareTab",
				"#user_information",
			],
			removeElementsInterval: [
			],
			css: `
				body {
					margin: 0 !important;
					padding: 0 !important;
					overflow: hidden !important;
					position: fixed !important;
					top: 0 !important;
					left: 0 !important;
					width: 100vw !important;
					height: 100vh !important;
				}
				
				html {
					overflow: hidden !important;
					height: 100vh !important;
				}
				
				#ChatTabContainer {
					position: fixed !important;
					top: 0 !important;
					left: 0 !important;
					width: 100vw !important;
					height: 100vh !important;
					margin: 0 !important;
					padding: 0 !important;
					overflow: auto !important;
					z-index: 9999 !important;
					background: #fff !important;
				}
				
				.BaseTabsContainer {
					position: fixed !important;
					top: 0 !important;
					left: 0 !important;
					width: 100vw !important;
					height: 100vh !important;
					margin: 0 !important;
					padding: 0 !important;
					overflow: auto !important;
					z-index: 9999 !important;
					background: #fff !important;
				}
				
				* {
					box-sizing: border-box !important;
				}
			`
		};
	} catch (error) {
		throw new ScriptException(`Failed to get live chat window: ${error.message}`);
	}
}

source.getSubComments = function (comment) {
	sourceUtils.log(`source.getSubComments(${comment})`);

	// For Chaturbate, there are no sub-comments/replies in the chat system
	// Return an empty comment list
	return new CommentPager([], false, {
		message: "No replies available for this comment.",
		parentComment: comment
	});
}

// endregion METHODS

sourceUtils.log("script.js END");