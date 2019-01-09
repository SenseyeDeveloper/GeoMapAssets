const SEARCH_QUERY_CENTER = "center";

class ApiClient {
    constructor(url) {
        this.url = url;
    }

    data(success, error) {
        fetch(this.url)
            .then((response) => {
                return response.json();
            })
            .then(success)
            .catch(error)
    }
}

class SyncState {
    constructor(complete) {
        this.completeHandler = complete;
        this.map = null;
        this.data = null;
    }

    setMap(map) {
        this.map = map;

        this.sync();
    }

    setData(data) {
        this.data = data;

        this.sync();
    }

    sync() {
        if (this.map === null || this.data === null) {
            return;
        }

        const complete = this.completeHandler;

        complete(this.data, this.map);
    }
}

class LoadHandler {
    constructor() {
        this.loaded = false;
        this.handler = null;
    }

    handle() {
        if (this.handler === null) {
            this.loaded = true;
        } else {
            const handler = this.handler;

            handler();
        }
    }

    on(handler) {
        if (this.loaded) {
            handler();
        } else {
            this.handler = handler;
        }
    }
}

class Debounce {
    constructor(delay) {
        this.timerId = 0;
        this.delay = delay;
    }

    handle(callable) {
        clearTimeout(this.timerId);

        this.timerId = setTimeout(callable, this.delay);
    }
}

class UniqueKeyChecker {
    constructor() {
        this.map = {};
        this.list = [];
    }

    /**
     *
     * @param {string} key
     * @returns {string}
     */
    unique(key) {
        if (this.map.hasOwnProperty(key)) {
            throw new Error(`already exists: ${key}`);
        }

        this.map[key] = true;
        this.list.push(key);

        return key;
    }

    /**
     *
     * @returns {Array}
     */
    keys() {
        return this.list;
    }
}

// @abstract
class CriteriaConverter {
    /**
     *
     * @param {string} data
     * @returns {*|null}
     */
    unmarshal(data) {
        throw new Error("implement me");
    }

    /**
     *
     * @param {*} data
     * @returns {string}
     */
    marshal(data) {
        throw new Error("implement me");
    }
}

class IdentityCriteriaConverter extends CriteriaConverter {
    unmarshal(data) {
        return data;
    }

    marshal(data) {
        return data;
    }
}

class RangeCriteriaConverter extends CriteriaConverter {
    constructor() {
        super();

        this.delimiter = "-";
    }

    unmarshal(data) {
        const between = data.split(this.delimiter);
        const from = parseInt(between[0], 10);

        if (between.length === 2) {
            const to = parseInt(between[1], 10);

            if (to > 0 && to >= from) {
                return {from, to};
            }

            return null;
        }

        if (from > 0) {
            return {from, to: 0};
        }

        return 0;
    }

    marshal({from, to}) {
        const data = [from];

        if (to > 0) {
            data.push(to);
        }

        return data.join(this.delimiter);
    }
}

class MultiSelectCriteriaConverter extends CriteriaConverter {
    constructor() {
        super();

        this.delimiter = ",";
    }

    unmarshal(aliases) {
        if (aliases !== "") {
            return aliases.split(this.delimiter);
        }

        return null;
    }

    marshal(aliases) {
        if (aliases.length === 0) {
            return "";
        }

        return aliases.join(this.delimiter);
    }
}

/**
 * @param {[string]} criteriaNames
 * @param {{}} criteriaNameConverterMap
 */
function assertConverterMap(criteriaNames, criteriaNameConverterMap) {
    for (let i = 0; i < criteriaNames.length; i++) {
        const criteriaName = criteriaNames[i];

        if (criteriaNameConverterMap.hasOwnProperty(criteriaName)) {
            continue;
        }

        throw new Error(`missing converter for "${criteriaName}"`);
    }
}

class UrlStateContainer {
    /**
     *
     * @param {{}} defaultState
     * @param {Number} delay
     * @param {[string]} criteriaNames
     * @param {{}} criteriaNameConverterMap
     */
    constructor(defaultState, delay, criteriaNames, criteriaNameConverterMap) {
        assertConverterMap(criteriaNames, criteriaNameConverterMap);

        this.center = defaultState.center;
        this.zoom = defaultState.zoom;

        const query = new URLSearchParams(window.location.search.substring(1));

        if (query.has(SEARCH_QUERY_CENTER)) {
            const queryCenter = parseCenterString(query.get(SEARCH_QUERY_CENTER));

            if (queryCenter) {
                const [latitude, longitude, zoom] = queryCenter;

                this.center = {latitude, longitude};
                this.zoom = zoom;
            }
        }

        this.buildCriteriaMap(this.parseCriteriaMap(query, criteriaNames, criteriaNameConverterMap));

        this.debounce = new Debounce(delay);
        this.lazyUpdateHandler = this.update.bind(this);
    }

    /**
     *
     * @returns {{}}
     */
    getCenter() {
        return this.center;
    }

    /**
     *
     * @param {{}} center
     */
    setCenter(center) {
        this.center = center;

        this.lazyUpdate();
    }

    /**
     *
     * @returns {Number}
     */
    getZoom() {
        return this.zoom;
    }

    /**
     *
     * @param {Number} zoom
     */
    setZoom(zoom) {
        this.zoom = zoom;

        this.lazyUpdate();
    }

    /**
     *
     * @param {string} criteriaName
     * @param {*} criteria
     * @returns {*}
     */
    getCriteriaByName(criteriaName, criteria = null) {
        if (this.criteriaMap.hasOwnProperty(criteriaName)) {
            return this.criteriaMap[criteriaName];
        }

        return criteria;
    }

    /**
     *
     * @param {{}} criteriaMap
     */
    setCriteriaMap(criteriaMap) {
        this.buildCriteriaMap(criteriaMap);

        this.update();
    }

    /**
     *
     * @param {{}} criteriaMap
     */
    buildCriteriaMap(criteriaMap) {
        const criteria = [];

        for (let criteriaName in criteriaMap) {
            if (criteriaMap.hasOwnProperty(criteriaName)) {
                /** @type CriteriaConverter */
                const converter = this.criteriaNameConverterMap[criteriaName];

                criteria.push(
                    "&" + criteriaName + "=" + encodeURIComponent(converter.marshal(criteriaMap[criteriaName]))
                );
            }
        }

        this.criteriaMap = criteriaMap;
        this.criteria = criteria.join("");
    }

    /**
     *
     * @param {URLSearchParams} query
     * @param {Array} criteriaNames
     * @param {{}} criteriaNameConverterMap
     * @returns {{}}
     */
    parseCriteriaMap(query, criteriaNames, criteriaNameConverterMap) {
        this.criteriaNameConverterMap = criteriaNameConverterMap;

        const criteriaMap = {};

        for (let i = 0; i < criteriaNames.length; i++) {
            const criteriaName = criteriaNames[i];

            if (query.has(criteriaName)) {
                /** @type CriteriaConverter */
                const converter = criteriaNameConverterMap[criteriaName];

                const source = decodeURIComponent(query.get(criteriaName)).trim();

                if (source !== "") {
                    const criteria = converter.unmarshal(source);

                    if (criteria !== null) {
                        criteriaMap[criteriaName] = criteria;
                    }
                }
            }
        }

        return criteriaMap;
    }

    lazyUpdate() {
        this.debounce.handle(this.lazyUpdateHandler);
    }

    update() {
        const center = this.center.latitude + "," + this.center.longitude + "," + this.zoom;

        window.history.pushState(
            null,
            "",
            window.location.pathname +
            "?" + SEARCH_QUERY_CENTER + "=" + center +
            this.criteria
        );
    }
}

// abstract
class LocationGrouper {
    /**
     *
     * @param list
     * @returns {GroupMarkerMap}
     */
    group(list) {
        return new GroupMarkerMap(GroupMarker);
    }
}

class GroupMarker {
    constructor(list) {
        this.list = list;
    }

    /**
     *
     * @returns {string}
     */
    getTitle() {
        throw new Error("implement me");
    }

    /**
     *
     * @returns {string}
     */
    getContent() {
        throw new Error("implement me");
    }
}

class Archiver {
    /**
     *
     * @param {Array} data
     * @returns {Array}
     */
    unzip(data) {
        throw new Error("implement me");
    }
}

class GroupMarkerMap {
    constructor(metaClass) {
        this.metaClass = metaClass;
        this.map = {};
    }

    add(latitude, longitude, item) {
        this.map[latitude] = this.map[latitude] || {};
        this.map[latitude][longitude] = this.map[latitude][longitude] || [];
        this.map[latitude][longitude].push(item);
    }

    /**
     *
     * @param latitude
     * @param longitude
     * @returns {GroupMarker}
     */
    fetch(latitude, longitude) {
        const items = this.map[latitude][longitude];

        const metaClass = this.metaClass;

        return new metaClass(items);
    }
}

class DataViewer {
    /**
     *
     * @param {ResultContainer} result
     */
    render(result) {
        throw new Error("implement me");
    }
}

class EmptyDataViewer extends DataViewer {
    /**
     *
     * @param {ResultContainer} result
     */
    render(result) {

    }
}

// @abstract
class MapViewer {
    /**
     *
     * @param {ResultContainer} result
     */
    render(result) {
        throw new Error("implement me");
    }
}

class EmptyMapViewer extends MapViewer {
    /**
     *
     * @param {ResultContainer} result
     */
    render(result) {

    }
}

class FilledMapViewer extends MapViewer {
    /**
     *
     * @param {LocationGrouper} locationGrouper
     * @param {{}} map
     */
    constructor(locationGrouper, map) {
        super();
        this.locationGrouper = locationGrouper;
        this.map = map;
        this.marker = [];
    }

    /**
     *
     * @param {ResultContainer} result
     */
    render(result) {
        this.clear();

        const groupMakerMap = this.locationGrouper.group(result.getResult());
        const locationMap = groupMakerMap.map;

        for (let latitude in locationMap) {
            if (locationMap.hasOwnProperty(latitude)) {
                for (let longitude in locationMap[latitude]) {
                    if (locationMap[latitude].hasOwnProperty(longitude)) {

                        const groupMarker = groupMakerMap.fetch(latitude, longitude);

                        const position = new google.maps.LatLng(latitude, longitude);

                        const marker = new google.maps.Marker({
                            position: position,
                            map: this.map,
                            title: groupMarker.getTitle()
                        });

                        this.click(marker, groupMarker);
                        this.marker.push(marker);
                    }
                }
            }
        }
    }

    /**
     *
     * @param marker
     * @param {GroupMarker} groupMarker
     */
    click(marker, groupMarker) {
        const map = this.map;

        google.maps.event.addListener(marker, "click", function () {
            const infoWindow = new google.maps.InfoWindow({
                content: groupMarker.getContent()
            });

            infoWindow.open(map, marker);
        });

        // https://developers.google.com/maps/documentation/javascript/events
        // Remove all click listeners from marker instance
        // google.maps.event.clearListeners(marker, 'click');
    }

    clear() {
        for (let i = 0; i < this.marker.length; i++) {
            const marker = this.marker[i];

            marker.setMap(null);
            google.maps.event.clearListeners(marker, "click");
        }
    }
}

class MapViewerManager {
    /**
     *
     * @param {LocationGrouper} locationGrouper
     */
    constructor(locationGrouper) {
        this.locationGrouper = locationGrouper;
        this.mapViewer = new EmptyMapViewer();
    }

    setMap(map) {
        this.mapViewer = new FilledMapViewer(this.locationGrouper, map);
    }

    render(result) {
        this.mapViewer.render(result);
    }
}

class StatsViewer {
    /**
     *
     * @param {ResultContainer} result
     */
    render(result) {

    }
}

function createSyncHandler() {
    const state = new LoadHandler();

    const result = function () {
        state.handle();
    };

    result.on = function (handler) {
        state.on(handler)
    };

    return result;
}

function parseCenterString(centerString) {
    if (centerString) {
        const [latitudeString, longitudeString, zoomString] = centerString.trim().split(",");

        const latitude = parseFloat(latitudeString, 10);
        const longitude = parseFloat(longitudeString, 10);
        const zoom = parseFloat(zoomString, 10);

        if (latitude > 0 && longitude > 0 && zoom > 0) {
            return [latitude, longitude, zoom];
        }
    }

    return null;
}

class FilterContainer {
    /**
     *
     * @param {{}} criteriaMap
     */
    constructor(criteriaMap = {}) {
        this.criteriaMap = criteriaMap;
    }

    /**
     * Return filtered copy of source
     *
     * @param {Array} source
     */
    filter(source) {
        throw new Error("implement me");
    }

    /**
     *
     * @returns {{}}
     */
    getCriteriaMap() {
        return this.criteriaMap;
    }
}

class EmptyFilterContainer extends FilterContainer {
    /**
     * Return same
     *
     * @param {Array} source
     */
    filter(source) {
        return source;
    }
}

class FilledFilterContainer extends FilterContainer {
    /**
     *
     * @param {{}} criteriaMap
     * @param {Matcher} matcher
     * @param {Modifier} modifier
     */
    constructor(criteriaMap, matcher, modifier) {
        super(criteriaMap);
        this.matcher = matcher;
        this.modifier = modifier;
    }

    /**
     *
     * @param {Array} source
     * @returns {Array}
     */
    filter(source) {
        const result = [];

        for (let i = 0; i < source.length; i++) {
            const item = source[i];

            if (this.matcher.match(item)) {
                const modified = this.modifier.modify(item);

                if (modified !== null) {
                    result.push(modified);
                }
            }
        }

        return result;
    }
}

/**
 * need for first render
 */
class FilterContainerView {
    /**
     *
     * @param {Array} source
     * @param {UrlStateContainer} urlStateContainer
     */
    render(source, urlStateContainer) {
        throw new Error("implement me");
    }
}

/**
 * @abstract
 */
class Matcher {
    /**
     *
     * @param item
     * @returns {boolean}
     */
    match(item) {
        throw new Error("implement me");
    }
}

/**
 * @abstract
 */
class FilterMatch extends Matcher {
    /**
     *
     * @returns {boolean}
     */
    empty() {
        throw new Error("implement me");
    }

    /**
     *
     * @returns {string}
     */
    criteria() {
        throw new Error("implement me");
    }
}

class MergeMatcher extends Matcher {
    /**
     *
     * @param {Matcher} source
     * @param {Matcher} next
     */
    constructor(source, next) {
        super();
        this.source = source;
        this.next = next;
    }

    /**
     *
     * @param item
     * @returns {boolean}
     */
    match(item) {
        return this.source.match(item) && this.next.match(item);
    }
}

class EmptyFilterMatch extends FilterMatch {
    /**
     *
     * @param item
     * @returns {boolean}
     */
    match(item) {
        return true;
    }

    /**
     *
     * @returns {boolean}
     */
    empty() {
        return true;
    }

    /**
     *
     * @returns {Array}
     */
    criteria() {
        return [];
    }
}

class FilledFilterMatch extends FilterMatch {
    /**
     *
     * @param {*} criteria
     */
    constructor(criteria) {
        super();
        this._criteria = criteria;
    }

    /**
     *
     * @param item
     * @returns {boolean}
     */
    match(item) {
        return false;
    }

    /**
     *
     * @returns {boolean}
     */
    empty() {
        return false;
    }

    /**
     *
     * @returns {Array}
     */
    criteria() {
        return this._criteria;
    }
}


class SameAliasFilterMatch extends FilledFilterMatch {
    constructor(criteria, aliases, state) {
        super(criteria);
        this.aliasMap = createAliasMap(aliases);
        this.state = state;
    }

    /**
     *
     * @param item
     * @returns {boolean}
     */
    match(item) {
        return this.aliasMap.hasOwnProperty(item.alias) === this.state;
    }
}

function createAliasMap(aliases) {
    const map = {};

    for (let i = 0; i < aliases.length; i++) {
        map[aliases[i]] = true;
    }

    return map;
}

/**
 * @abstract
 */
class FilterMatchBuilder {
    /**
     *
     * @returns {FilterMatch}
     */
    build() {
        throw new Error("implement me");
    }
}

/**
 * @abstract
 */
class Modifier {
    /**
     *
     * @param {{}} item
     * @returns {{}}
     */
    modify(item) {
        throw new Error("implement me");
    }
}

/**
 * @abstract
 */
class StateModifier extends Modifier {
    /**
     *
     * @returns {boolean}
     */
    empty() {
        throw new Error("implement me");
    }

    /**
     *
     * @returns {Array}
     */
    criteria() {
        throw new Error("implement me");
    }
}

class EmptyStateModifier extends StateModifier {
    /**
     *
     * @param {{}} item
     * @returns {{}}
     */
    modify(item) {
        return item;
    }

    /**
     *
     * @returns {boolean}
     */
    empty() {
        return true;
    }

    /**
     *
     * @returns {Array}
     */
    criteria() {
        return [];
    }
}

class FilledStateModifier extends StateModifier {
    /**
     *
     * @param {*} criteria
     */
    constructor(criteria) {
        super();
        this._criteria = criteria;
    }

    /**
     *
     * @returns {boolean}
     */
    empty() {
        return false;
    }

    /**
     *
     * @returns {Array}
     */
    criteria() {
        return this._criteria;
    }
}

class MergeModifier extends Modifier {
    /**
     *
     * @param {Modifier} source
     * @param {Modifier} next
     */
    constructor(source, next) {
        super();
        this.source = source;
        this.next = next;
    }

    /**
     *
     * @param {{}} item
     * @returns {{}}
     */
    modify(item) {
        let result = this.source.modify(item);

        if (result === null) {
            return null;
        }

        return this.next.modify(result);
    }
}

/**
 * @abstract
 */
class StateModifierBuilder {
    /**
     *
     * @returns {StateModifier}
     */
    build() {
        throw new Error("implement me");
    }
}


class FilterContainerBuilder {
    /**
     * map, where key = criteria name and value = {FilterMatchBuilder} builder
     *
     * @param {{}} filterMatchBuilderMap
     * @param {{}} stateModifierBuilderMap
     */
    constructor(filterMatchBuilderMap, stateModifierBuilderMap) {
        this.filterMatchBuilderMap = filterMatchBuilderMap;
        this.stateModifierBuilderMap = stateModifierBuilderMap;
    }

    /**
     *
     * @returns {FilterContainer}
     */
    build() {
        let existsMatcher = false;
        let existsModifier = false;
        let matcher = new EmptyFilterMatch();
        let modifier = new EmptyStateModifier();

        const criteriaMap = {};

        const filterMatchBuilderMap = this.filterMatchBuilderMap;
        const stateModifierBuilderMap = this.stateModifierBuilderMap;

        for (let criteriaName in filterMatchBuilderMap) {
            if (filterMatchBuilderMap.hasOwnProperty(criteriaName)) {

                /** @type FilterMatchBuilder */
                const filterMatchBuilder = filterMatchBuilderMap[criteriaName];

                const filterMatch = filterMatchBuilder.build();

                if (filterMatch.empty()) {
                    continue;
                }

                existsMatcher = true;
                criteriaMap[criteriaName] = filterMatch.criteria();
                matcher = new MergeMatcher(matcher, filterMatch);
            }
        }

        for (let criteriaName in stateModifierBuilderMap) {
            if (stateModifierBuilderMap.hasOwnProperty(criteriaName)) {

                /** @type StateModifierBuilder */
                const stateModifierBuilder = stateModifierBuilderMap[criteriaName];

                const stateModifier = stateModifierBuilder.build();

                if (stateModifier.empty()) {
                    continue;
                }

                existsModifier = true;
                criteriaMap[criteriaName] = stateModifier.criteria();
                modifier = new MergeModifier(modifier, stateModifier);
            }
        }

        if (existsMatcher || existsModifier) {
            return new FilledFilterContainer(criteriaMap, matcher, modifier);
        }

        return new EmptyFilterContainer();
    }
}

// @abstract
class FilterViewBuilder {
    /**
     *
     * @param {Array} list
     */
    build(list) {
        throw new Error("implement me");
    }
}

class EmptyFilterViewBuilder extends FilterViewBuilder {
    /**
     *
     * @param {Array} list
     */
    build(list) {
        // NOP
    }
}

class CallbackFilterViewBuilder extends FilterViewBuilder {
    constructor(handler) {
        super();

        this.handler = handler;
    }

    /**
     *
     * @param {Array} list
     */
    build(list) {
        const handler = this.handler;

        handler(list);
    }
}

// @abstract
class Searcher {
    /**
     *
     * @returns {ResultContainer}
     */
    search() {
    }
}

class FilledSearcher extends Searcher {
    /**
     *
     * @param {Array} source
     * @param {FilterContainerBuilder} filterContainerBuilder
     */
    constructor(source, filterContainerBuilder) {
        super();
        this.source = source;
        this.filterContainerBuilder = filterContainerBuilder;
    }

    /**
     *
     * @returns {ResultContainer}
     */
    search() {
        const startTime = Date.now();
        const filterContainer = this.filterContainerBuilder.build();
        const result = filterContainer.filter(this.source);
        const duration = Date.now() - startTime;

        return new ResultContainer(result, filterContainer, duration);
    }
}

class NullSearcher extends Searcher {
    /**
     *
     * @returns {ResultContainer}
     */
    search() {
        return new ResultContainer([], new EmptyFilterContainer(), 0);
    }
}

class SearcherManager extends Searcher {
    constructor(searcher) {
        super();
        this.setSearcher(searcher);
    }

    /**
     *
     * @returns {ResultContainer}
     */
    search() {
        return this.searcher.search();
    }

    /**
     *
     * @param {Searcher} searcher
     */
    setSearcher(searcher) {
        this.searcher = searcher;
    }
}

class ResultContainer {
    /**
     *
     * @param {Array} result
     * @param {FilterContainer} filterContainer
     * @param {Number} duration
     */
    constructor(result, filterContainer, duration) {
        this.result = result;
        this.filterContainer = filterContainer;
        this.duration = duration;
    }

    /**
     *
     * @returns {Number}
     */
    getCount() {
        return this.result.length;
    }

    /**
     *
     * @returns {Array}
     */
    getResult() {
        return this.result;
    }

    /**
     *
     * @returns {Number}
     */
    getDuration() {
        return this.duration;
    }

    /**
     *
     * @returns {{}}
     */
    getCriteriaMap() {
        return this.filterContainer.getCriteriaMap();
    }
}

class ResultCountProps {
    constructor({shown = false, loaded = false, submit = false, empty = false, count = ""} = {}) {
        this.shown = shown;
        this.loaded = loaded;
        this.submit = submit;
        this.empty = empty;
        this.count = count;
    }
}

class SubmitAction {
    /**
     *
     * @param {Function} handler
     */
    constructor(handler) {
        this.handler = handler;
    }

    submit() {
        const handler = this.handler;

        handler();
    }
}

class ResultCountComponent {
    /**
     *
     * @param {SubmitAction} submitAction
     */
    constructor(submitAction) {
        this.$hint = $("#js-count-hint");
        this.$loader = $(".js-count-loader", this.$hint);
        this.$count = $(".js-count-result", this.$hint);
        this.$empty = $(".js-empty", this.$hint);
        this.$submit = $(".js-submit", this.$hint);

        $(".js-close", this.$hint).click(() => this.hide());
        this.$submit.click(() => {
            submitAction.submit();
            this.hide();
        });
    }

    /**
     *
     * @param {Number} top
     */
    setTop(top) {
        this.$hint.css("top", top);
    }

    /**
     *
     * @param {Number} count
     */
    showCount(count) {
        this.render(new ResultCountProps({
            shown: true,
            submit: count > 0,
            empty: count === 0,
            count: count
        }));
    }

    /**
     *
     * @param {ResultCountProps} props
     */
    render(props) {
        this.$hint.toggleClass("shown", props.shown);
        this.$loader.toggleClass("loader", props.loaded);
        this.$count.html(props.count);
        this.$empty.toggle(props.empty);
        this.$submit.toggle(props.submit);
    }

    hide() {
        this.render(new ResultCountProps());
    }
}

class EmptyCloseComponent {
    close() {
        // NOP
    }
}
/**
 * callback after external map loaded
 */
initializeMap = createSyncHandler();

class Application {
    /**
     *
     * @param {UrlStateContainer} urlStateContainer
     * @param {MapViewerManager} mapViewerManager
     * @param {DataViewer} dataViewer
     * @param {StatsViewer} statsViewer
     * @param {ApiClient} apiClient
     * @param {Archiver} archiver
     * @param {FilterContainerBuilder} filterContainerBuilder
     * @param {FilterViewBuilder} filterViewBuilder
     */
    constructor(urlStateContainer, mapViewerManager, dataViewer, statsViewer, apiClient, archiver, filterContainerBuilder, filterViewBuilder) {
        this.urlStateContainer = urlStateContainer;
        this.mapViewer = mapViewerManager;
        this.dataViewer = dataViewer;
        this.statsViewer = statsViewer;
        this.apiClient = apiClient;
        this.archiver = archiver;
        this.filterContainerBuilder = filterContainerBuilder;
        this.filterViewBuilder = filterViewBuilder;

        this.searcherManager = new SearcherManager(new NullSearcher());
        this.resultContainer = this.searcherManager.search();
    }

    start() {
        const self = this;
        const urlStateContainer = this.urlStateContainer;
        const mapViewerManager = this.mapViewer;
        const archiver = this.archiver;
        const apiClient = this.apiClient;
        const filterContainerBuilder = this.filterContainerBuilder;
        const filterViewBuilder = this.filterViewBuilder;
        const searcherManager = this.searcherManager;

        const syncState = new SyncState(function (source, map) {
            const list = archiver.unzip(source);

            filterViewBuilder.build(list);

            searcherManager.setSearcher(new FilledSearcher(list, filterContainerBuilder));

            mapViewerManager.setMap(map);

            self.initializeSearchAndRender();
        });

        apiClient.data(function (data) {
            syncState.setData(data);
        }, console.error);

        initializeMap.on(function () {
            const center = urlStateContainer.getCenter();

            const options = {
                zoom: urlStateContainer.getZoom(),
                center: new google.maps.LatLng(center.latitude, center.longitude),
                mapTypeId: google.maps.MapTypeId.TERRAIN,
                mapTypeControl: false
            };

            const map = new google.maps.Map(document.getElementById("js-google-map"), options);

            syncState.setMap(map);

            map.addListener("center_changed", function () {
                const center = map.getCenter();

                urlStateContainer.setCenter({
                    latitude: center.lat(),
                    longitude: center.lng()
                });
            });

            map.addListener("zoom_changed", function () {
                urlStateContainer.setZoom(map.getZoom());
            });
        });
    }

    initializeSearchAndRender() {
        this.search();
        this.render(this.resultContainer);
    }

    searchAndRender() {
        this.search();
        /** @type ResultContainer */
        const resultContainer = this.resultContainer;

        this.render(resultContainer);

        this.urlStateContainer.setCriteriaMap(resultContainer.getCriteriaMap());
    }

    /**
     *
     * @returns {Number}
     */
    searchAndCount() {
        this.search();

        /** @type ResultContainer */
        const resultContainer = this.resultContainer;

        return resultContainer.getCount();
    }

    search() {
        this.resultContainer = this.searcherManager.search();
    }

    renderAfterSearch() {
        /** @type ResultContainer */
        const resultContainer = this.resultContainer;

        this.render(resultContainer);

        this.urlStateContainer.setCriteriaMap(resultContainer.getCriteriaMap());
    }

    /**
     *
     * @param {ResultContainer} resultContainer
     */
    render(resultContainer) {
        this.mapViewer.render(resultContainer);
        this.statsViewer.render(resultContainer);
    }

    renderLinks() {
        this.dataViewer.render(this.resultContainer);
    }
}
// <required-project-logic>
class CompanyLocationGrouper extends LocationGrouper {
    group(list) {
        return createLatitudeLongitudeContainer(list);
    }
}

class CompanyGroupMarker extends GroupMarker {
    /**
     *
     * @returns {string}
     */
    getTitle() {
        const titles = [];

        for (let item of this.list) {
            titles.push(item.name);
        }

        return titles.join(" | ");
    }

    /**
     *
     * @returns {string}
     */
    getContent() {
        const contents = [];

        for (let company of this.list) {
            const vacancies = [];

            for (let vacancy of company.vacancies) {
                vacancies.push(`<a href="` + vacancyUrl(company.alias, vacancy.id) + `" target="_blank">` + vacancy.title + `</a>` + salary(vacancy.salary))
            }

            const office = company.offices[0];
            const content = `<div class="infowindow"><a class="infowindow-company" href=${companyUrl(company.alias)} target="_blank">${company.name}</a></br><p class="infowindow-address">${office.address}</p>${vacancies.join("<br/>")}</div>`;
            contents.push(content);
        }

        return contents.join("<br/><br/>");
    }
}

class CompanyArchiver extends Archiver {
    unzip(data) {
        return unzipCompanies(data);
    }
}

// </required-project-logic>

// <current-project-logic>
function unzipOffices(source) {
    const length = source.length;

    const result = new Array(length);

    for (let i = 0; i < length; i++) {
        const office = source[i];

        result[i] = new Office(
            office[0],
            office[1],
            office[2]
        );
    }

    return result;
}

function unzipVacancies(source) {
    const length = source.length;

    const result = new Array(length);

    for (let i = 0; i < length; i++) {
        const vacancy = source[i];

        result[i] = new Vacancy(
            vacancy[0],
            vacancy[1],
            vacancy[2],
            vacancy[3],
            vacancy[4],
            vacancy[5]
        );
    }

    return result;
}

function unzipCompanies(source) {
    const length = source.length;

    const result = new Array(length);

    for (let i = 0; i < length; i++) {
        const company = source[i];

        result[i] = new Company(
            company[0],
            company[1],
            unzipOffices(company[2]),
            unzipVacancies(company[3]),
            company[4],
            company[5],
            company[6]
        );
    }

    return result;
}

class Company {
    constructor(alias, name, offices, vacancies, review_count, employee_count, type) {
        this.alias = alias;
        this.name = name;
        this.offices = offices;
        this.vacancies = vacancies;
        this.review_count = review_count;
        this.employee_count = employee_count;
        this.type = type;
    }
}

class Location {
    constructor(data) {
        this.latitude = data[0];
        this.longitude = data[1];
    }
}

class Office {
    constructor(city, address, location) {
        this.city = city;
        this.address = address;
        this.location = new Location(location);
    }
}

class Vacancy {
    constructor(id, title, cities, existsOffice, salary, published) {
        this.id = id;
        this.title = title;
        this.cities = cities;
        this.existsOffice = existsOffice;
        this.salary = salary;
        this.published = published;
    }
}

/**
 *
 * @param companies
 * @returns {GroupMarkerMap}
 */
function createLatitudeLongitudeContainer(companies) {
    const map = new GroupMarkerMap(CompanyGroupMarker);

    for (let company of companies) {
        for (let office of company.offices) {
            const vacancies = currentOfficeVacancies(office, company.vacancies);

            if (vacancies.length === 0) {
                continue;
            }

            map.add(
                office.location.latitude,
                office.location.longitude,
                new Company(
                    company.alias,
                    company.name,
                    [office],
                    vacancies,
                    company.review_count,
                    company.employee_count,
                    company.type
                )
            );
        }
    }

    return map;
}

function currentOfficeVacancies(office, vacancies) {
    const result = [];

    const officeCity = office.city.toLowerCase();

    for (let i = 0; i < vacancies.length; i++) {
        const vacancy = vacancies[i];

        if (vacancy.exists_office === false || inListCaseInsensitive(vacancy.cities, officeCity)) {
            result.push(vacancy);
        }
    }

    return result;
}

function inListCaseInsensitive(list, item) {
    for (let i = 0; i < list.length; i++) {
        if (list[i].toLowerCase() === item) {
            return true
        }
    }

    return false;
}

function vacancyUrl(companyAlias, vacancyId) {
    return `https://jobs.dou.ua/companies/${companyAlias}/vacancies/${vacancyId}/`;
}

function companyUrl(alias) {
    return `https://jobs.dou.ua/companies/${alias}/`;
}

function salary(value) {
    if (value) {
        return " (" + value + ")"
    }

    return "";
}

// </current-project-logic>

// <filter-project-logic>
class ReviewExistsFilterMatch extends FilledFilterMatch {
    /**
     *
     * @param item
     * @returns {boolean}
     */
    match(item) {
        return item.review_count > 0;
    }
}

class MultiSelectFilterMatch extends FilledFilterMatch {
    /**
     *
     * @param {[string]} aliases
     */
    constructor(aliases) {
        super(aliases);

        this.aliasMap = createAliasMap(aliases);
    }
}

class CompanySizeFilterMatch extends MultiSelectFilterMatch {
    /**
     *
     * @param {Company} item
     * @returns {boolean}
     */
    match(item) {
        return this.aliasMap.hasOwnProperty(item.employee_count);
    }
}

class CompanyTypeFilterMatch extends MultiSelectFilterMatch {
    /**
     *
     * @param {Company} item
     * @returns {boolean}
     */
    match(item) {
        return this.aliasMap.hasOwnProperty(item.type);
    }
}

class VacancyStateModifier extends FilledStateModifier {
    /**
     *
     * @param {[string]} criteria
     * @param {Function} matcher
     */
    constructor(criteria, matcher) {
        super(criteria);
        this.matcher = matcher;
    }

    /**
     *
     * @param {Company} company
     * @returns {Company|null}
     */
    modify(company) {
        const matchVacancies = [];
        const matcher = this.matcher;

        for (let j = 0; j < company.vacancies.length; j++) {
            const vacancy = company.vacancies[j];

            if (matcher(vacancy)) {
                matchVacancies.push(vacancy);
            }
        }

        if (matchVacancies.length > 0) {
            return new Company(
                company.alias,
                company.name,
                company.offices,
                matchVacancies,
                company.review_count,
                company.employee_count,
                company.type
            );
        }

        return null;
    }
}

class TitleStateModifier extends VacancyStateModifier {
    /**
     *
     * @param {string} title
     */
    constructor(title) {
        const search = title.toLowerCase();

        super(title, function (vacancy) {
            return vacancy.title.toLowerCase().indexOf(search) !== -1;
        });
    }
}

class SalaryStateModifier extends VacancyStateModifier {
    /**
     *
     * @param {{}} criteria
     */
    constructor(criteria) {
        let {from, to} = criteria;

        if (to === 0) {
            to = Number.MAX_SAFE_INTEGER;
        }

        super(criteria, function (vacancy) {
            if (vacancy.salary === "") {
                return false;
            }

            return salaryBetweenRange(vacancy.salary, from, to);
        });
    }
}

function salaryBetweenRange(source, from, to) {
    const strings = source.split("–");
    const salaries = [];

    for (let i = 0; i < strings.length; i++) {
        const salary = parseInt(strings[i].replace(/\D/g, ""), 10);

        if (between(from, to, salary)) {
            return true;
        }

        salaries.push(salary);
    }

    if (salaries.length === 1) {
        salaries[1] = salaries[0];
    }

    return between(salaries[0], salaries[1], from) || between(salaries[0], salaries[1], to);
}

function between(from, to, value) {
    return from <= value && value <= to;
}

class CheckboxComponent {
    /**
     *
     * @param {{}} $element
     * @param {string} checked
     */
    constructor($element, checked) {
        this.$element = $element;

        if (checked === "1") {
            this.$element.attr("checked", "checked");
        }
    }

    /**
     *
     * @returns {boolean}
     */
    checked() {
        return this.$element.is(":checked");
    }

    /**
     *
     * @returns {string}
     */
    criteria() {
        return "1";
    }
}

class ReviewExistsFilterMatchBuilder extends FilterMatchBuilder {
    /**
     *
     * @param {{}} $element
     * @param {Array} aliases
     */
    constructor($element, aliases) {
        super();

        this.checkbox = new CheckboxComponent($element, aliases);
    }

    build() {
        if (this.checkbox.checked()) {
            return new ReviewExistsFilterMatch(this.checkbox.criteria());
        }

        return new EmptyFilterMatch();
    }
}

class CompanyFilterMatchBuilder extends FilterMatchBuilder {
    /**
     *
     * @param {{}} $element
     */
    constructor($element) {
        super();
        this.$element = $element;
    }

    build() {
        const selected = [];
        const disabled = [];
        const aliasCheckMap = [];

        $("input", this.$element).each(function () {
            const $self = $(this);
            const alias = $self.attr("data-alias");

            const checked = $self.is(":checked");
            aliasCheckMap[alias] = checked;

            if (checked) {
                selected.push(alias);
            } else {
                disabled.push(alias);
            }
        });

        if (selected.length > 0) {
            return new SameAliasFilterMatch(aliasCheckMap, selected, true);
        }

        if (disabled.length > 0) {
            return new SameAliasFilterMatch(aliasCheckMap, disabled, false);
        }

        return new EmptyFilterMatch();
    }
}

class MultiSelectFilterMatchBuilder extends FilterMatchBuilder {
    /**
     *
     * @param {{}} $checkboxes
     * @param {[string]} aliases
     * @param {string} className
     */
    constructor($checkboxes, aliases, className) {
        super();

        if (aliases !== null) {
            const aliasMap = createAliasMap(aliases);

            $checkboxes.each(function () {
                const $self = $(this);
                const alias = $self.attr("data-alias");

                if (aliasMap.hasOwnProperty(alias)) {
                    $self.attr("checked", "checked");
                }
            });
        }

        this.$checkboxes = $checkboxes;
        this.className = className;
    }

    build() {
        const aliases = [];
        const $checkboxes = this.$checkboxes;

        $checkboxes.each(function () {
            const $self = $(this);
            const alias = $self.attr("data-alias");

            if ($self.is(":checked")) {
                aliases.push(alias);
            }
        });

        if (aliases.length > 0 && aliases.length < $checkboxes.length) {
            const className = this.className;

            return new className(aliases);
        }

        return new EmptyFilterMatch();
    }
}

class CompanySizeFilterMatchBuilder extends MultiSelectFilterMatchBuilder {
    /**
     *
     * @param {{}} $checkboxes
     * @param {[string]} aliases
     */
    constructor($checkboxes, aliases) {
        super($checkboxes, aliases, CompanySizeFilterMatch);
    }
}

class CompanyTypeFilterMatchBuilder extends MultiSelectFilterMatchBuilder {
    /**
     *
     * @param {{}} $checkboxes
     * @param {[string]} aliases
     */
    constructor($checkboxes, aliases) {
        super($checkboxes, aliases, CompanyTypeFilterMatch);
    }
}

class TitleStateModifierBuilder extends StateModifierBuilder {
    /**
     *
     * @param {{}} $element
     * @param {*} text
     */
    constructor($element, text) {
        super();
        this.$element = $element;

        if (text !== null) {
            this.$element.val(text);
        }
    }

    build() {
        const text = this.$element.val();

        if (text.length > 0) {
            return new TitleStateModifier(text);
        }

        return new EmptyStateModifier();
    }
}

function subNdays(n) {
    const offset = (24 * 60 * 60 * 1000) * n;
    const now = new Date();
    now.setTime(now.getTime() - offset);

    return `${now.getFullYear()}-${leftPadNumber(now.getMonth() + 1)}-${leftPadNumber(now.getDate())}`;
}

function leftPadNumber(number) {
    if (number > 9) {
        return number;
    }

    return "0" + number;
}

class NewestStateModifier extends VacancyStateModifier {
    constructor(criteria) {
        const published = subNdays(7);

        super(criteria, function (vacancy) {
            return vacancy.published >= published;
        });
    }
}

class NewestStateModifierBuilder extends StateModifierBuilder {
    /**
     *
     * @param {{}} $element
     * @param {Array} aliases
     */
    constructor($element, aliases) {
        super();

        this.checkbox = new CheckboxComponent($element, aliases);
    }

    build() {
        if (this.checkbox.checked()) {
            return new NewestStateModifier(this.checkbox.criteria());
        }

        return new EmptyStateModifier();
    }
}

class SalaryModifierBuilder extends StateModifierBuilder {
    constructor($salaryFrom, $salaryTo, {from, to} = {}) {
        super();
        this.$salaryFrom = $salaryFrom;
        this.$salaryTo = $salaryTo;

        if (from > 0) {
            this.$salaryFrom.val(from);
        }

        if (to > 0) {
            this.$salaryTo.val(to);
        }
    }

    build() {
        const from = parseInt(this.$salaryFrom.val() || "0", 10);
        const to = parseInt(this.$salaryTo.val() || "0", 10);

        if (isNaN(from) || isNaN(to) || from < 0 || to < 0 || (from > to && to > 0) || (from === 0 && to === 0)) {
            return new EmptyStateModifier();
        }

        return new SalaryStateModifier({from, to});
    }
}

class JobStatsViewer extends StatsViewer {
    constructor($vacancyCount, $companyCount, $duration) {
        super();
        this.$vacancyCount = $vacancyCount;
        this.$companyCount = $companyCount;
        this.$duration = $duration;
    }

    /**
     *
     * @param {ResultContainer} result
     */
    render(result) {
        this.$duration.html(result.getDuration());
        this.$vacancyCount.html(vacancyCount(result));
        this.$companyCount.html(result.getCount());
    }
}

/**
 *
 * @param {ResultContainer} result
 * @returns {number}
 */
function vacancyCount(result) {
    const companies = result.getResult();

    let count = 0;

    for (let i = 0; i < companies.length; i++) {
        count += companies[i].vacancies.length;
    }

    return count;
}

class JobAutocomplete {
    constructor(companies) {
        const companyNameMap = {};
        const vaancyNameMap = {};
        const companyNameAliasMap = {};

        for (let i = 0; i < companies.length; i++) {
            /** @type Company */
            const company = companies[i];

            companyNameMap[company.name] = null;
            companyNameAliasMap[company.name] = company.alias;

            const vacancies = company.vacancies;

            for (let j = 0; j < vacancies.length; j++) {
                const vacancy = vacancies[j];

                vaancyNameMap[vacancy.title] = null;
            }

        }

        this.companyNameMap = companyNameMap;
        this.vaancyNameMap = vaancyNameMap;
        this.companyNameAliasMap = companyNameAliasMap;
    }

    /**
     *
     * @returns {{}}
     */
    getCompanyNameMap() {
        return this.companyNameMap;
    }

    /**
     *
     * @returns {{}}
     */
    getVacancyNameMap() {
        return this.vaancyNameMap;
    }

    /**
     *
     * @param {string} name
     * @returns {string}
     */
    findCompanyAliasByName(name) {
        if (this.companyNameAliasMap.hasOwnProperty(name)) {
            return this.companyNameAliasMap[name];
        }

        return "";
    }
}

function renderSelectedCompany(companyName, companyAlias, checked) {
    const id = `js-company-input-${companyAlias}`;

    return `<p>
    <label for="${id}">
        <input type="checkbox" id="${id}" ${checked} data-alias="${companyAlias}" />
        <span>${companyName} <span class="badge js-company-remove">x</span></span>
    </label>
</p>`;
}

class JobDataViewer extends DataViewer {
    /**
     *
     * @param {Element} $element
     * @param {UrlStateContainer} urlStateContainer
     */
    constructor($element, urlStateContainer) {
        super();
        this.$element = $element;
        this.urlStateContainer = urlStateContainer;
    }

    /**
     *
     * @param {ResultContainer} result
     */
    render(result) {
        const companies = result.getResult();
        const center = this.urlStateContainer.getCenter();

        companies.sort(function (a, b) {
            return distance(a.offices[0].location, center) - distance(b.offices[0].location, center);
        });

        const views = [];

        const length = Math.min(companies.length, 20);
        for (let i = 0; i < length; i++) {
            views.push(renderCompany(companies[i]));
        }

        this.$element.html(views.join(""));
    }
}

function distance(a, b) {
    const x = a.latitude - b.latitude;
    const y = a.longitude - b.longitude;

    return x * x + y * y;
}

function renderCompany(company) {
    const views = [];

    for (let i = 0; i < company.vacancies.length; i++) {
        const vacancy = company.vacancies[i];

        views.push(`<p><a href="${vacancyUrl(company.alias, vacancy.id)}" target="_blank">${vacancy.title}</a></p>`);
    }

    return `
        <div class="row">
            <div class="col s12 work-block z-depth-2 card-panel hoverable">
                <div class="col s12 header">
                    <div class="title"><a href="${companyUrl(company.alias)}" target="_blank">${company.name}</a></div>
                </div>
                <div class="col s12 message">
                    ${views.join("")}
                </div>
            </div>
        </div>
    `;
}

class MultiCheckboxCriteriaConverter extends CriteriaConverter {
    constructor() {
        super();

        this.suffix = "-unchecked";
    }

    unmarshal(source) {
        if (source !== "") {
            const aliases = source.split(",");

            const result = {};

            for (let i = 0; i < aliases.length; i++) {
                const alias = aliases[i];

                if (alias.endsWith(this.suffix)) {
                    result[alias.substring(0, alias.length - this.suffix.length)] = false;
                } else {
                    result[alias] = true;
                }
            }

            return result;
        }

        return null;
    }

    marshal(aliasCheckMap) {
        const aliases = [];
        for (let alias in aliasCheckMap) {
            if (aliasCheckMap.hasOwnProperty(alias)) {
                const checked = aliasCheckMap[alias];

                if (checked === true) {
                    aliases.push(alias);
                } else if (checked === false) {
                    aliases.push(alias + this.suffix);
                } else {
                    console.error(`wrong state for "${alias}" = "${checked}"`)
                }
            }
        }

        return aliases.join(",");
    }
}

class SelectedCompanyListView {
    /**
     *
     * @param $element
     */
    constructor($element) {
        const self = this;

        this.$element = $element;
        this.aliasMap = {};

        $element.on("click", ".js-company-remove", function (event) {
            const $root = $(event.target).closest("p");

            const companyAlias = $("input", $root).attr("data-alias");

            $root.remove();

            self.remove(companyAlias);
        });
    }

    /**
     *
     * @param {string} companyName
     * @param {string} companyAlias
     */
    addChecked(companyName, companyAlias) {
        if (this.aliasMap.hasOwnProperty(companyAlias)) {
            return;
        }

        this.$element.append(renderSelectedCompany(companyName, companyAlias, "checked"));

        this.aliasMap[companyAlias] = true;
    }

    /**
     *
     * @param {[Company]} companies
     * @param {{}} aliasCheckMap
     */
    render(companies, aliasCheckMap) {
        if (aliasCheckMap === null) {
            return;
        }

        const elements = [];

        for (let i = 0; i < companies.length; i++) {
            const company = companies[i];

            if (aliasCheckMap.hasOwnProperty(company.alias)) {
                let checked = "";

                if (aliasCheckMap[company.alias] === true) {
                    checked = "checked";
                }

                elements.push(renderSelectedCompany(company.name, company.alias, checked));

                this.aliasMap[company.alias] = true;
            }
        }

        this.$element.append(elements.join(""));
    }

    /**
     *
     * @param companyAlias
     */
    remove(companyAlias) {
        delete this.aliasMap[companyAlias];
    }
}

/**
 *
 * @param {[Company]} companies
 * @returns {string}
 */
function getRandomCompanyTitle(companies) {
    return getRandomItemByList(companies).name;
}

/**
 *
 * @param {[Company]} companies
 */
function getRandomVacancyTitle(companies) {
    const company = getRandomItemByList(companies);

    return getRandomItemByList(company.vacancies).title;
}

/**
 *
 * @param {[{}]} items
 * @returns {{}}
 */
function getRandomItemByList(items) {
    const limit = items.length - 1;
    const index = Math.floor(Math.random() * limit);

    return items[index];
}

// </filter-project-logic>
$(document).ready(function () {
    const KEY_CODE = {
        ESCAPE: 27,
        ENTER: 13,
        UP: 38,
        DOWN: 40,
        BACKSPACE: 8
    };

    const uniqueKeyChecker = new UniqueKeyChecker();

    const SEARCH_QUERY_VACANCY = uniqueKeyChecker.unique("vacancy-query");
    const REVIEW_COUNT_CRITERIA_NAME = uniqueKeyChecker.unique("company-review");
    const COMPANY_CRITERIA_NAME = uniqueKeyChecker.unique("company");
    const NEWEST_CRITERIA_NAME = uniqueKeyChecker.unique("vacancy-newest");
    const SALARY_CRITERIA_NAME = uniqueKeyChecker.unique("vacancy-salary");
    const COMPANY_SIZE_CRITERIA_NAME = uniqueKeyChecker.unique("company-size");
    const COMPANY_TYPE_CRITERIA_NAME = uniqueKeyChecker.unique("company-type");

    const multiCheckboxCriteriaConverter = new MultiCheckboxCriteriaConverter();
    const identityCriteriaConverter = new IdentityCriteriaConverter();
    const multiSelectCriteriaConverter = new MultiSelectCriteriaConverter();
    const urlStateContainer = new UrlStateContainer(
        {
            center: {
                latitude: 50.4435158,
                longitude: 30.5030242
            },
            zoom: 14
        },
        500,
        uniqueKeyChecker.keys(),
        {
            [REVIEW_COUNT_CRITERIA_NAME]: identityCriteriaConverter,
            [SEARCH_QUERY_VACANCY]: identityCriteriaConverter,
            [COMPANY_CRITERIA_NAME]: multiCheckboxCriteriaConverter,
            [NEWEST_CRITERIA_NAME]: identityCriteriaConverter,
            [SALARY_CRITERIA_NAME]: new RangeCriteriaConverter(),
            [COMPANY_SIZE_CRITERIA_NAME]: multiSelectCriteriaConverter,
            [COMPANY_TYPE_CRITERIA_NAME]: multiSelectCriteriaConverter,
        }
    );

    const $vacancySearch = $("#js-vacancy-autocomplete");
    const $companySearch = $("#js-company-autocomplete");
    const $reviewExists = $("#js-review-exists");
    const $newest = $("#js-vacancy-newest");
    const $linkView = $("#js-nearest-center-companies");
    const $selectedCompaniesContainer = $("#js-selected-companies");
    const $salaryFrom = $("#js-salary-from");
    const $salaryTo = $("#js-salary-to");
    const $companySizes = $("#js-company-size-filter input");
    const $companyTypes = $("#js-company-type-filter input");

    const selectedCompanyListView = new SelectedCompanyListView($selectedCompaniesContainer);

    let vacancyAutocomplete = new EmptyCloseComponent();

    const application = new Application(
        urlStateContainer,
        new MapViewerManager(new CompanyLocationGrouper()),
        new JobDataViewer($linkView, urlStateContainer),
        new JobStatsViewer(
            $("#js-result-vacancy-count"),
            $("#js-result-company-count"),
            $("#js-result-show-time")
        ),
        new ApiClient("https://cdn.jsdelivr.net/gh/senseyedeveloper/geomapdata/companies.json"),
        new CompanyArchiver(),
        new FilterContainerBuilder({
            [REVIEW_COUNT_CRITERIA_NAME]: new ReviewExistsFilterMatchBuilder($reviewExists, urlStateContainer.getCriteriaByName(REVIEW_COUNT_CRITERIA_NAME)),
            [COMPANY_CRITERIA_NAME]: new CompanyFilterMatchBuilder($selectedCompaniesContainer),
            [COMPANY_SIZE_CRITERIA_NAME]: new CompanySizeFilterMatchBuilder($companySizes, urlStateContainer.getCriteriaByName(COMPANY_SIZE_CRITERIA_NAME)),
            [COMPANY_TYPE_CRITERIA_NAME]: new CompanyTypeFilterMatchBuilder($companyTypes, urlStateContainer.getCriteriaByName(COMPANY_TYPE_CRITERIA_NAME)),
        }, {
            [SEARCH_QUERY_VACANCY]: new TitleStateModifierBuilder($vacancySearch, urlStateContainer.getCriteriaByName(SEARCH_QUERY_VACANCY)),
            [NEWEST_CRITERIA_NAME]: new NewestStateModifierBuilder($newest, urlStateContainer.getCriteriaByName(NEWEST_CRITERIA_NAME)),
            [SALARY_CRITERIA_NAME]: new SalaryModifierBuilder($salaryFrom, $salaryTo, urlStateContainer.getCriteriaByName(SALARY_CRITERIA_NAME, {})),
        }),
        new CallbackFilterViewBuilder(function (list) {
            const jobAutocomplete = new JobAutocomplete(list);

            $vacancySearch.autocomplete({
                data: jobAutocomplete.getVacancyNameMap(),
                onAutocomplete: function (name) {
                    application.searchAndRender();
                }
            });

            vacancyAutocomplete = M.Autocomplete.getInstance($vacancySearch);

            $companySearch.autocomplete({
                data: jobAutocomplete.getCompanyNameMap(),
                onAutocomplete: function (companyName) {
                    const companyAlias = jobAutocomplete.findCompanyAliasByName(companyName);

                    selectedCompanyListView.addChecked(companyName, companyAlias);

                    $companySearch.val("");

                    application.searchAndRender();
                }
            });

            selectedCompanyListView.render(list, urlStateContainer.getCriteriaByName(COMPANY_CRITERIA_NAME));

            $vacancySearch.attr("placeholder", getRandomVacancyTitle(list));
            $companySearch.attr("placeholder", getRandomCompanyTitle(list));
        }),
    );

    application.start();

    const $container = $(".js-container");

    const resultCountComponent = new ResultCountComponent(new SubmitAction(function () {
        application.renderAfterSearch();
    }));

    const inputChange = function () {
        resultCountComponent.setTop($(this).offset().top - $container.offset().top);
        resultCountComponent.showCount(application.searchAndCount());
    };

    const enterPress = function (event) {
        if (event.keyCode === KEY_CODE.ENTER) {
            application.searchAndRender();
        }
    };

    $reviewExists.on("change", inputChange);
    $newest.on("change", inputChange);
    $companySizes.on("change", inputChange);
    $companyTypes.on("change", inputChange);
    $selectedCompaniesContainer.on("change", "input", inputChange);
    $salaryFrom.on("keyup", enterPress);
    $salaryTo.on("keyup", enterPress);

    $("#js-search-submit").click(function () {
        application.searchAndRender();
    });

    $vacancySearch.on("keyup", function (event) {
        if (event.keyCode === KEY_CODE.ENTER) {
            application.searchAndRender();

            vacancyAutocomplete.close();
        }

        if (event.keyCode === KEY_CODE.ESCAPE) {
            vacancyAutocomplete.close();
        }
    });

    $("#js-tabs").tabs();
    $("#js-sync-list-result").click(function () {
        application.renderLinks();
    });
});