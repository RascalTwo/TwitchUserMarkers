/**
 * Delay execution by {@link ms milliseconds}
 *
 * @param {number} ms
 */
function delay(ms) {
	return new Promise(r => setTimeout(r, ms))
}

/**
 * Click nodes one by one in {@link queries}, waiting until they are in the DOM one by one
 *
 *
 * @param  {...any} queries queries of nodes to click
 */
async function clickNodes(...queries) {
	for (const query of queries) {
		while (true) {
			const node = document.querySelector(query)
			if (node) {
				node.click();
				break;
			} else {
				await delay(100);
			}
		}
	}
}

/**
 * If the page is a VOD
 *
 * @returns {boolean}
 */
function isVOD() {
	return window.location.pathname.startsWith('/videos')
}

/**
 * If the page is Live
 *
 * @returns {boolean}
 */
function isLive() {
	return isAlternatePlayer() || window.location.pathname.split('/').slice(1).length === 1
}

/**
 * If the page is the Alternate Player
 *
 * @returns {boolean}
 */
function isAlternatePlayer() {
	return window.location.href.startsWith('chrome-extension://');
}

/**
 * Get the username/loginName of the current page
 *
 * @returns {string}
 */
function getLoginName() {
	return isAlternatePlayer()
		// `channel=loginName` is in the URL
		? new URLSearchParams(window.location.search).get('channel')
		: isLive()
			// URL ends with loginName
			? window.location.pathname.split('/')[1]
			// URL channel=loginName exists in `og:video` metadata
			: new URLSearchParams(document.querySelector('meta[property="og:video"]').getAttribute('content').split('?').slice(1).join('?')).get('channel')
};

/**
 * Parse from Minimal to Chapter objects
 *
 * @param {string} text
 * @yields {{ name: string, seconds: number }}
 */
function* parseMinimalChapters(text) {
	for (const line of text.trim().split('\n').map(line => line.trim()).filter(Boolean)) {
		const [dhms, name] = line.split('\t');
		const seconds = DHMStoSeconds(dhms.split(':').map(Number));
		yield { name, seconds }
	}
}

/**
 * Convert chapters to Minimal text
 *
 * @param {{ name: string, seconds: number }[]} chapters
 */
function* chaptersToMinimal(chapters) {
	for (const chapter of chapters.sort((a, b) => a.seconds - b.seconds)) {
		const dhms = secondsToDHMS(chapter.seconds)
		yield [dhms, chapter.name].join('\t');
	}
}

/**
 * Convert DHMS to seconds, each part is optional except seconds
 *
 * @param {number[]} parts DHMS numberic parts
 * @returns {number} seconds
 */
function DHMStoSeconds(parts) {
	// seconds
	if (parts.length === 1) return parts[0];
	// minutes:seconds
	else if (parts.length === 2) return (parts[0] * 60) + parts[1]
	// hours:minutes:seconds
	else if (parts.length === 3) return (parts[0] * 60 * 60) + (parts[1] * 60) + parts[2]
	// days:hours:minute:seconds
	return (parts[0] * 60 * 60 * 24) + (parts[1] * 60 * 60) + (parts[2] * 60) + parts[3]
}

/**
 * Convert seconds to DHMS
 *
 * @param {number} seconds
 * @returns {string}
 */
function secondsToDHMS(seconds) {
	// TODO - fix this rushed math
	const days = parseInt(seconds / 86400)
	const hours = parseInt((seconds - (days * 86400)) / 3600)
	const minutes = parseInt((seconds % (60 * 60)) / 60)
	const parts = [days, hours, minutes, seconds % 60]
	while (!parts[0]) parts.shift()
	return parts.join(':')
}

function generateTwitchTimestamp(seconds) {
	const symbols = ['d', 'h', 'm']
	const dhms = Array.from(secondsToDHMS(seconds));

	// 0:1:2:3 -> 0:1:2m3 -> 0:1h2m3 -> 0d1h2m3
	while (true) {
		const index = dhms.lastIndexOf(':');
		if (index === -1) break;
		dhms[index] = symbols.pop();
	}

	return dhms.join('') + 's';
}

ids = (() => {
	let userID = undefined;
	let vid = undefined;
	// Get VID from URL if VOD
	if (isVOD()) vid = window.location.href.split('/').slice(-1)[0].split('?')[0];

	/**
	 * Get the ID of the page user
	 *
	 * @returns {number}
	 */
	async function getUserID() {
		if (userID) return userID;

		// TODO - optimize GQL query
		return fetch("https://gql.twitch.tv/gql", {
			"headers": {
				"client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
			},
			"body": `{"query":"query($login: String!, $skip: Boolean!) {\\n\\t\\t\\t\\tuser(login: $login) {\\n\\t\\t\\t\\t\\tbroadcastSettings {\\n\\t\\t\\t\\t\\t\\tlanguage\\n\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t\\tcreatedAt\\n\\t\\t\\t\\t\\tdescription\\n\\t\\t\\t\\t\\tdisplayName\\n\\t\\t\\t\\t\\tfollowers {\\n\\t\\t\\t\\t\\t\\ttotalCount\\n\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t\\tid\\n\\t\\t\\t\\t\\tlastBroadcast {\\n\\t\\t\\t\\t\\t\\tstartedAt\\n\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t\\tprimaryTeam {\\n\\t\\t\\t\\t\\t\\tdisplayName\\n\\t\\t\\t\\t\\t\\tname\\n\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t\\tprofileImageURL(width: 70)\\n\\t\\t\\t\\t\\tprofileViewCount\\n\\t\\t\\t\\t\\tself @skip(if: $skip) {\\n\\t\\t\\t\\t\\t\\tcanFollow\\n\\t\\t\\t\\t\\t\\tfollower {\\n\\t\\t\\t\\t\\t\\t\\tdisableNotifications\\n\\t\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t}\\n\\t\\t\\t}","variables":{"login":"${getLoginName()}","skip":false}}`,
			"method": "POST",
		}).then(r => r.json()).then(json => {
			userID = json.data.user.id;
			return userID;
		});
	}

	/**
	 * Get ID of video, may not exist if on live page and archive stream does not exist
	 *
	 * @param {boolean} promptUser If to prompt the user for the ID if it could not be found
	 * @returns {string}
	 */
	async function getVideoID(promptUser) {
		if (promptUser && vid === null) {
			// TODO - replace with HTML dialog
			const response = prompt('Video ID could not be detected, please provide it:');
			if (!response) return;
			vid = response;
		}
		if (vid !== undefined) return vid;
		// TODO - optimize GQL query
		return getUserID().then(uid => fetch("https://gql.twitch.tv/gql", {
			"headers": {
				"client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
			},
			"body": `{"query":"query($id: ID!, $all: Boolean!) {\\n\\t\\t\\t\\t\\tuser(id: $id) {\\n\\t\\t\\t\\t\\t\\tbroadcastSettings {\\n\\t\\t\\t\\t\\t\\t\\tgame {\\n\\t\\t\\t\\t\\t\\t\\t\\tdisplayName\\n\\t\\t\\t\\t\\t\\t\\t\\tname\\n\\t\\t\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t\\t\\t\\ttitle\\n\\t\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t\\t\\tlogin\\n\\t\\t\\t\\t\\t\\tstream {\\n\\t\\t\\t\\t\\t\\t\\tarchiveVideo @include(if: $all) {\\n\\t\\t\\t\\t\\t\\t\\t\\tid\\n\\t\\t\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t\\t\\t\\tcreatedAt\\n\\t\\t\\t\\t\\t\\t\\tid\\n\\t\\t\\t\\t\\t\\t\\ttype\\n\\t\\t\\t\\t\\t\\t\\tviewersCount\\n\\t\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t}","variables":{"id":"${uid}","all":true}}`,
			"method": "POST",
		})).then(r => r.json()).then(json => {
			vid = json.data.user.stream.archiveVideo?.id ?? null
			return getVideoID(promptUser);
		});
	}

	return { getUserID, getVideoID }
})();

/**
 * Track the delay of a promise
 *
 * @param {Promise<T>} promise promise to track delay of
 * @returns {{ delay: number, response: T }}
 */
async function trackDelay(promise) {
	const requested = Date.now();
	const response = await promise();
	return { delay: Date.now() - requested, response };
}


// Run cleanup if previously loaded, development only
window.r2?.cleanup?.()
r2 = await(async () => {
	// Get last segment of URL, which is the video ID
	const chapters = JSON.parse(localStorage.getItem('r2_chapters_' + await ids.getVideoID()) ?? '[]');

	// Functions to call to remove script from site
	let cleanupFuncs = []
	/**
	 * Get the current time in seconds of the player
	 *
	 * @returns {number}
	 */
	let getCurrentTimeLive = async () => 0;
	let chapterChangeHandlers = [
		async () => localStorage.setItem('r2_chapters_' + await ids.getVideoID(), JSON.stringify(chapters))
	]
	if (isVOD()) {

		/**
		 * Get X and Y of the seconds provided
		 *
		 * @param {number} seconds
		 * @returns {{ x: number, y: number }}
		 */
		function getTimeXY(seconds) {
			const bar = document.querySelector('[data-a-target="player-seekbar"]');

			const rect = bar.getBoundingClientRect();
			const minX = rect.left;
			const maxX = rect.right;

			const duration = Number(document.querySelector('[data-a-target="player-seekbar-duration"]').dataset.aValue);
			const percentage = seconds / duration;
			const x = ((maxX - minX) * percentage) + minX;
			const y = (rect.bottom + rect.top) / 2
			return { x, y }
		}

		/**
		 * Set time to the seconds provided
		 *
		 * @param {number} seconds
		 */
		function setTime(seconds) {
			const bar = document.querySelector('[data-a-target="player-seekbar"]');

			const event = new MouseEvent('click', { clientX: getTimeXY(seconds).x });
			// Directly hook into onClick of react element, bar.dispatchEvent(event) did NOT work
			Object.entries(bar).find(([key]) => key.startsWith('__reactEventHandlers'))[1].onClick(event);
		}

		/**
		 * Remove chapter DOM elements, done before rendering and cleanup
		 */
		const removeDOMChapters = () => {
			document.querySelectorAll('.r2_chapter').forEach(e => e.remove());
		}

		/**
		 * Handle when marker is directly clicked
		 *
		 * @param {{ name: string, seconds: number}} chapter
		 * @param {MouseEvent} e
		 */
		const handleMarkerClick = (chapter, e) => {
			setTime(chapter.seconds)
		}

		chapterChangeHandlers.push(function renderChapters() {
			removeDOMChapters();
			for (const [i, chapter] of chapters.entries()) {
				const node = document.createElement('button')
				node.className = 'r2_chapter'
				node.title = chapter.name;
				node.style.position = 'absolute';
				const { x, y } = getTimeXY(chapter.seconds)
				node.style.top = y + 'px';
				// TODO - properly position element in center of where it should be
				node.style.left = (x - 2.5) + 'px';
				node.style.zIndex = 1;
				node.textContent = i
				node.addEventListener('click', handleMarkerClick.bind(null, chapter))
				document.body.appendChild(node);
			}
		})

		// Pull current time from DHMS display, it's always accurate in VODs
		getCurrentTimeLive = async () => DHMStoSeconds(document.querySelector('[data-a-target="player-seekbar-current-time"]').textContent.split(':').map(Number))
		cleanupFuncs.push(removeDOMChapters)
	}
	else if (isLive()) {
		if (isAlternatePlayer()) {
			// m_Player.getPlaybackPositionBroadcast() on AlternatePlayer
			getCurrentTimeLive = async () => м_Проигрыватель.ПолучитьПозициюВоспроизведенияТрансляции()

		} else {
			/**
			 * Return the number of seconds of delay as reported by Twitch
			 *
			 * @returns {number}
			 */
			async function getLiveDelay() {
				const latency = document.querySelector('[aria-label="Latency To Broadcaster"]');
				const bufferSize = document.querySelector('[aria-label="Buffer Size"]');
				if (!latency || !bufferSize) {
					// Settings Gear -> Advanced -> Video Stats Toggle
					await clickNodes('[data-a-target="player-settings-button"]', '[data-a-target="player-settings-menu-item-advanced"]', '[data-a-target="player-settings-submenu-advanced-video-stats"] input');
					return getLiveDelay();
				}

				// Video Stats Toggle -> Settings Gear
				clickNodes('[data-a-target="player-settings-submenu-advanced-video-stats"] input', '[data-a-target="player-settings-button"]');
				return [latency, bufferSize].map(e => Number(e.textContent.split(' ')[0])).reduce((sum, s) => sum + s);
			}

			getCurrentTimeLive = async () => {
				const { delay, response: secondsDelay } = await trackDelay(async () => getLiveDelay());
				const currentTime = DHMStoSeconds(document.querySelector('.live-time').textContent.split(':').map(Number))
				const actualTime = currentTime - secondsDelay - (delay / 1000);
				return actualTime;
			}
		}
		/*
		async function generateCurrentURLTime() {
			const { delay, response: { vid, actualTime } } = await trackDelay(async () => ({
				vid: await ids.getVideoID(true),
				actualTime: await getCurrentTimeLive()
			}));
			return {
				delayAdjusted: `https://twitch.tv/videos/${vid}?t=${generateTwitchTimestamp(parseInt(actualTime - (delay / 1000)))}`,
				returned: `https://twitch.tv/videos/${vid}?t=${generateTwitchTimestamp(parseInt(actualTime))}`
			};
		}
		*/
	}

	async function handleChapterUpdate() {
		for (const func of chapterChangeHandlers) await func();
	}

	/**
	 * Add chapter to current time
	 */
	const addChapterHere = async () => {
		const seconds = await getCurrentTimeLive();
		// TODO - replace with dialog
		const name = prompt('Name');
		if (!name) return;

		chapters.push({ seconds, name });
		return handleChapterUpdate();
	}


	/**
	 * Import minimal chapter text
	 */
	async function importMinimal() {
		const markdown = await navigator.clipboard.readText()
		chapters.splice(0, chapters.length, ...Array.from(parseMinimalChapters(markdown)));
		return handleChapterUpdate();
	}


	/**
	 * Export chapter objects into minimal chapters
	 */
	const exportMarkdown = () => {
		navigator.clipboard.writeText(Array.from(chaptersToMinimal(chapters)).join('\n'));
		alert('Exported to Clipboard!');
	}

	/**
	 * Menu for importing or exporting
	 */
	const menu = () => {
		// TODO - replace with dialog
		const choice = prompt('(I)mport or (E)xport')
		if (!choice) return;
		if (choice.toLowerCase() === 'i') importMinimal()
		else if (choice.toLowerCase() === 'e') exportMarkdown();
	}

	/**
	 * Handle keyboard shortcuts
	 *
	 * @param {KeyboardEvent} e
	 */
	const keydownHandler = e => {
		// TODO - change key to somthing else, C toggles the chat in AlternatePlayer
		if (e.key === 'c') menu()
		if (e.key === 'b') addChapterHere()
	};
	window.addEventListener('keydown', keydownHandler);

	let renderTimeout = 0;
	/**
	 * Handle window resizing
	 */
	const resizeHandler = () => {
		clearTimeout(renderTimeout);
		renderTimeout = setTimeout(handleChapterUpdate, 1000);
	};
	window.addEventListener('resize', resizeHandler);

	function cleanup() {
		window.removeEventListener('keydown', keydownHandler);
		window.removeEventListener('resize', resizeHandler);
		cleanupFuncs.forEach(func => func())
	}

	if (chapters.length) await handleChapterUpdate();

	return { chapters, cleanup };
})();