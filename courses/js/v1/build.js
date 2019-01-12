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

class AliasFilterMatchBuilder extends FilterMatchBuilder {
    /**
     *
     * @param {jQuery} $element
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


class AutocompletedCheckboxListListView {
    /**
     *
     * @param {jQuery} $element
     * @param {string} componentAlias
     */
    constructor($element, componentAlias) {
        const self = this;

        this.$element = $element;
        this.componentAlias = componentAlias;
        this.aliasMap = {};

        $element.on("click", ".js-remove", function (event) {
            const $root = $(event.target).closest("p");

            const companyAlias = $("input", $root).attr("data-alias");

            $root.remove();

            self.remove(companyAlias);
        });
    }

    /**
     *
     * @param {string} name
     * @param {string} alias
     */
    addChecked(name, alias) {
        if (this.aliasMap.hasOwnProperty(alias)) {
            return;
        }

        this.$element.append(this.renderCheckbox(name, alias, true));

        this.aliasMap[alias] = true;
    }

    /**
     *
     * @param {[{}]} items
     * @param {{}} aliasCheckMap
     */
    render(items, aliasCheckMap) {
        if (aliasCheckMap === null) {
            return;
        }

        const views = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            if (aliasCheckMap.hasOwnProperty(item.alias)) {
                views.push(this.renderCheckbox(item.name, item.alias, aliasCheckMap[item.alias] === true));

                this.aliasMap[item.alias] = true;
            }
        }

        this.$element.append(views.join(""));
    }

    renderCheckbox(name, alias, checked) {
        let checkedAttr = "";
        if (checked) {
            checkedAttr = "checked";
        }

        const id = `js-${this.componentAlias}-input-${alias}`;

        return `<p>
    <label for="${id}">
        <input type="checkbox" id="${id}" ${checkedAttr} data-alias="${alias}" />
        <span>${name} <span class="badge js-remove">x</span></span>
    </label>
</p>`;
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
 * @param $checkboxes
 * @returns {[string]}
 */
function getCheckedAliases($checkboxes) {
    const aliases = [];

    $checkboxes.each(function () {
        const $self = $(this);
        const alias = $self.attr("data-alias");

        if ($self.is(":checked")) {
            aliases.push(alias);
        }
    });

    return aliases;
}

/**
 *
 * @param $checkboxes
 * @param {string} className
 * @returns {FilterMatch}
 */
function buildFilterMatchByCheckboxes($checkboxes, className) {
    return buildFilterByCheckboxes($checkboxes, className, EmptyFilterMatch)
}

/**
 *
 * @param $checkboxes
 * @param {string} className
 * @returns {StateModifier}
 */
function buildStateModifierByCheckboxes($checkboxes, className) {
    return buildFilterByCheckboxes($checkboxes, className, EmptyStateModifier)
}


/**
 *
 * @param $checkboxes
 * @param {string} className
 * @param {string} emptyClassName
 * @returns {FilterMatch|StateModifier}
 */
function buildFilterByCheckboxes($checkboxes, className, emptyClassName) {
    const aliases = getCheckedAliases($checkboxes);

    if (aliases.length > 0 && aliases.length < $checkboxes.length) {
        return new className(aliases);
    }

    return new emptyClassName();
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

class CheckboxStateModifierBuilder extends StateModifierBuilder {
    /**
     *
     * @param {{}} $element
     * @param {string} checked
     * @param {string} className
     */
    constructor($element, checked, className) {
        super();

        this.checkbox = new CheckboxComponent($element, checked);
        this.className = className;
    }

    build() {
        if (this.checkbox.checked()) {
            const className = this.className;

            return new className(this.checkbox.criteria());
        }

        return new EmptyStateModifier();
    }
}

class CheckboxFilterMatchBuilder extends FilterMatchBuilder {
    /**
     *
     * @param {{}} $element
     * @param {string} checked
     * @param {string} className
     */
    constructor($element, checked, className) {
        super();

        this.checkbox = new CheckboxComponent($element, checked);
        this.className = className;
    }

    build() {
        if (this.checkbox.checked()) {
            const className = this.className;

            return new className(this.checkbox.criteria());
        }

        return new EmptyFilterMatch();
    }
}

function distance(a, b) {
    const x = a.latitude - b.latitude;
    const y = a.longitude - b.longitude;

    return x * x + y * y;
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
class CourseLocationGrouper extends LocationGrouper {
    group(list) {
        return createLatitudeLongitudeContainer(list);
    }
}

class CourseGroupMarker extends GroupMarker {
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

        for (let course of this.list) {
            const directions = [];

            for (let direction of course.directions) {
                directions.push(`<a href="` + direction.url + `" target="_blank">` + direction.title + `</a>`);
            }

            const content = `<div class="infowindow"><a class="infowindow-company" href=${course.url} target="_blank">${course.name}</a><br/><br/>${directions.join("<br/>")}</div>`;
            contents.push(content);
        }

        return contents.join("<br/><br/>");
    }
}

class CourseArchiver extends Archiver {
    unzip(data) {
        return data;
    }
}

// </required-project-logic>

// <current-project-logic>
class Course {
    /**
     *
     * @param {string} alias
     * @param {string} name
     * @param {string} url
     * @param directions
     * @param cities
     */
    constructor(alias, name, url, directions, cities) {
        this.alias = alias;
        this.name = name;
        this.url = url;
        this.directions = directions;
        this.cities = cities;
    }
}

function createLatitudeLongitudeContainer(courses) {
    const map = new GroupMarkerMap(CourseGroupMarker);

    for (let course of courses) {
        for (let city of course.cities) {
            for (let office of city.locations) {
                map.add(
                    office.latitude,
                    office.longitude,
                    new Course(
                        course.alias,
                        course.name,
                        course.url,
                        course.directions,
                        course.cities
                    )
                );
            }
        }
    }

    return map;
}

class SchoolStatsViewer extends StatsViewer {
    constructor($courseCount, $directionCount, $cityCount) {
        super();
        this.$courseCount = $courseCount;
        this.$directionCount = $directionCount;
        this.$cityCount = $cityCount;
    }

    /**
     *
     * @param {ResultContainer} result
     */
    render(result) {
        const courseCounter = new UniqueMapCounter();
        const directionCounter = new UniqueMapCounter();
        const citiesCounter = new UniqueMapCounter();

        const courses = result.getResult();

        for (let i = 0; i < courses.length; i++) {
            const course = courses[i];
            const directions = course.directions;
            const cities = course.cities;

            courseCounter.add(course.alias);

            for (let j = 0; j < directions.length; j++) {
                directionCounter.add(directions[j].category.alias);
            }

            for (let j = 0; j < cities.length; j++) {
                citiesCounter.add(cities[j].alias);
            }
        }

        this.$courseCount.html(courseCounter.getCount());
        this.$directionCount.html(directionCounter.getCount());
        this.$cityCount.html(citiesCounter.getCount());
    }
}

class UniqueMapCounter {
    constructor() {
        this.map = {};
        this.count = 0;
    }

    add(value) {
        if (this.map.hasOwnProperty(value)) {
            return;
        }

        this.map[value] = true;
        ++this.count;
    }

    getCount() {
        return this.count;
    }
}

class CourseAutocomplete {
    constructor(courses) {
        const directionNameMap = {};
        const courseNameMap = {};
        const courseNameAliasMap = {};

        for (let i = 0; i < courses.length; i++) {
            /** @type Course */
            const course = courses[i];

            courseNameMap[course.name] = null;
            courseNameAliasMap[course.name] = course.alias;

            const directions = course.directions;

            for (let j = 0; j < directions.length; j++) {
                const direction = directions[j];

                directionNameMap[direction.title] = null;
            }

        }

        this.courseNameMap = courseNameMap;
        this.directionNameMap = directionNameMap;
        this.courseNameAliasMap = courseNameAliasMap;
    }

    /**
     *
     * @param {string} name
     * @returns {string}
     */
    findCourseAliasByName(name) {
        if (this.courseNameAliasMap.hasOwnProperty(name)) {
            return this.courseNameAliasMap[name];
        }

        return "";
    }

    /**
     *
     * @returns {{}}
     */
    getSchoolNameMap() {
        return this.courseNameMap;
    }

    /**
     *
     * @returns {{}}
     */
    getDirectionNameMap() {
        return this.directionNameMap;
    }
}

class DirectionStateModifier extends FilledStateModifier {
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
     * @param {Course} school
     * @returns {Course|null}
     */
    modify(school) {
        const matchDirections = [];

        const matcher = this.matcher;

        const directions = school.directions;

        for (let j = 0; j < directions.length; j++) {
            const direction = directions[j];

            if (matcher(direction)) {
                matchDirections.push(direction);
            }
        }

        if (matchDirections.length > 0) {
            return new Course(
                school.alias,
                school.name,
                school.url,
                matchDirections,
                school.cities
            );
        }

        return null;
    }
}

class DirectionTitleStateModifier extends DirectionStateModifier {
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

class DirectionCategoryStateModifier extends DirectionStateModifier {
    constructor(aliases) {
        const aliasMap = createAliasMap(aliases);

        super(aliases, function (direction) {
            return aliasMap.hasOwnProperty(direction.category.alias);
        });
    }
}

class TeacherWorkInCompanyStateModifier extends DirectionStateModifier {
    constructor(aliases) {
        super(aliases, function (direction) {
            const teachers = direction.teachers;

            if (teachers === null) {
                return false;
            }

            for (let i = 0; i < teachers.length; i++) {
                const teacher = teachers[i];

                if (teacher.job === true) {
                    return true;
                }
            }

            return false;
        });
    }
}

class EmploymentGuaranteeStateModifier extends DirectionStateModifier {
    constructor(aliases) {
        super(aliases, function (direction) {
            return direction.employment_guarantee === true;
        });
    }
}


class DirectionTitleStateModifierBuilder extends StateModifierBuilder {
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
            return new DirectionTitleStateModifier(text);
        }

        return new EmptyStateModifier();
    }
}

class DirectionCategoryStateModifierBuilder extends StateModifierBuilder {
    /**
     *
     * @param {jQuery} $element
     */
    constructor($element) {
        super();
        this.$element = $element;
    }

    /**
     *
     * @returns {StateModifier}
     */
    build() {
        return buildStateModifierByCheckboxes($("input", this.$element), DirectionCategoryStateModifier);
    }
}

class CityStateModifier extends FilledStateModifier {
    constructor(aliases) {
        super(aliases);
        this.aliasMap = createAliasMap(aliases);
    }

    /**
     *
     * @param {Course} course
     * @returns {Course}
     */
    modify(course) {
        const cities = [];

        for (let i = 0; i < course.cities.length; i++) {
            const city = course.cities[i];

            if (this.aliasMap.hasOwnProperty(city.alias)) {
                cities.push(city);
            }
        }

        if (cities.length > 0) {
            return new Course(
                course.alias,
                course.name,
                course.url,
                course.directions,
                cities
            );
        }

        return null;
    }
}

class CityStateModifierBuilder extends StateModifierBuilder {
    /**
     *
     * @param {{}} $element
     */
    constructor($element) {
        super();
        this.$element = $element;
    }

    /**
     *
     * @returns {FilterMatch}
     */
    build() {
        return buildStateModifierByCheckboxes($("input", this.$element), CityStateModifier)
    }
}

class OptionCountComponent {
    /**
     *
     * @param {string} alias
     * @param {string} name
     */
    constructor(alias, name) {
        this.alias = alias;
        this.name = name;
        this.count = 0;
    }

    /**
     *
     * @param {number} value
     */
    increment(value) {
        this.count += value;
    }
}

class OptionCountComponentPriorityListGenerator {
    constructor() {
        this.map = {};
    }

    /**
     *
     * @param {[Course]} courses
     * @param {[OptionCountComponent]} courses
     */
    generate(courses) {
        throw new Error("implement me");
    }

    /**
     *
     * @param {string} alias
     * @param {string} name
     * @param {number} value
     */
    increment(alias, name, value) {
        /** @type OptionCountComponent */
        let optionCountComponent;

        if (this.map.hasOwnProperty(alias)) {
            optionCountComponent = this.map[alias];
        } else {
            optionCountComponent = new OptionCountComponent(alias, name);

            this.map[alias] = optionCountComponent;
        }

        optionCountComponent.increment(value);
    }

    sort() {
        /** @type [OptionCountComponent] */
        const result = [];

        for (let alias in this.map) {
            if (this.map.hasOwnProperty(alias)) {
                result.push(this.map[alias]);
            }
        }

        result.sort(compareOptionCountComponent);

        return result;
    }

}

/**
 *
 * @param {OptionCountComponent} a
 * @param {OptionCountComponent} b
 * @returns {number}
 */
function compareOptionCountComponent(a, b) {
    const diff = b.count - a.count;

    if (diff === 0) {
        return compareString(b.name, a.name);
    }

    return diff;
}

/**
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareString(a, b) {
    if (a > b) {
        return 1;
    }

    if (a < b) {
        return -1;
    }

    return 0;
}

class CityPriorityListGenerator extends OptionCountComponentPriorityListGenerator {
    generate(courses) {
        for (let i = 0; i < courses.length; i++) {
            const course = courses[i];

            const value = course.directions.length;

            for (let j = 0; j < course.cities.length; j++) {
                const city = course.cities[j];

                this.increment(city.alias, city.name, value);
            }
        }

        return this.sort();
    }
}

class DirectionCategoryPriorityListGenerator extends OptionCountComponentPriorityListGenerator {
    generate(courses) {
        for (let i = 0; i < courses.length; i++) {
            const course = courses[i];

            const directions = course.directions;

            for (let j = 0; j < directions.length; j++) {
                const direction = directions[j];
                const category = direction.category;

                this.increment(category.alias, category.name, 1);
            }
        }

        return this.sort();
    }
}

class OptionCountComponentListRender {
    /**
     *
     * @param {{}} $element
     */
    constructor($element) {
        this.$element = $element;
    }

    /**
     *
     * @param {[OptionCountComponent]} list
     * @param {[string]} aliases
     */
    render(list, aliases) {
        const views = [];
        const aliasMap = createAliasMap(aliases);

        for (let i = 0; i < list.length; i++) {
            const item = list[i];

            views.push(this.view(item, aliasMap.hasOwnProperty(item.alias)));
        }

        this.$element.html(views.join(""));
    }

    /**
     *
     * @param {OptionCountComponent} item
     * @param {boolean} checked
     */
    view(item, checked) {
        throw new Error("implement me");
    }
}

class CommonOptionCountComponentListRender extends OptionCountComponentListRender {
    /**
     *
     * @param {{}} $element
     * @param {string} componentAlias
     */
    constructor($element, componentAlias) {
        super($element);
        this.componentAlias = componentAlias;
    }

    /**
     *
     * @param {OptionCountComponent} item
     * @param {boolean} checked
     */
    view(item, checked) {
        const id = `js-${this.componentAlias}-${item.alias}`;

        let checkedAttr = "";
        if (checked) {
            checkedAttr = "checked";
        }

        return `<p>
    <label for="${id}">
        <input type="checkbox" id="${id}" data-alias="${item.alias}" ${checkedAttr} />
        <span>${item.name}</span>
    </label>
</p>`
    }
}

class CityListRender extends CommonOptionCountComponentListRender {
    /**
     *
     * @param {{}} $element
     */
    constructor($element) {
        super($element, "city");
    }
}

class DirectionCategoryListRender extends CommonOptionCountComponentListRender {
    /**
     *
     * @param {{}} $element
     */
    constructor($element) {
        super($element, "direction-cateogory");
    }
}

class FreeStatusFilterMatch extends FilledFilterMatch {
    /**
     *
     * @param item
     * @returns {boolean}
     */
    match(item) {
        return item.free_status === 1;
    }
}

class FreeStatusFilterMatchBuilder extends CheckboxFilterMatchBuilder {
    /**
     *
     * @param {{}} $element
     * @param {Array} aliases
     */
    constructor($element, aliases) {
        super($element, aliases, FreeStatusFilterMatch);
    }
}

class PlanExistsFilterMatch extends FilledFilterMatch {
    /**
     *
     * @param item
     * @returns {boolean}
     */
    match(item) {
        return item.plan_exists === true;
    }
}

class PlanExistsFilterMatchBuilder extends CheckboxFilterMatchBuilder {
    /**
     *
     * @param {{}} $element
     * @param {Array} aliases
     */
    constructor($element, aliases) {
        super($element, aliases, PlanExistsFilterMatch);
    }
}

class SchoolByCompanyFilterMatch extends FilledFilterMatch {
    /**
     *
     * @param item
     * @returns {boolean}
     */
    match(item) {
        return item.is_company === true;
    }
}

class SchoolByCompanyFilterMatchBuilder extends CheckboxFilterMatchBuilder {
    /**
     *
     * @param {{}} $element
     * @param {Array} aliases
     */
    constructor($element, aliases) {
        super($element, aliases, SchoolByCompanyFilterMatch);
    }
}

class TeacherWorkInCompanyStateModifierBuilder extends CheckboxStateModifierBuilder {
    /**
     *
     * @param {{}} $element
     * @param {Array} aliases
     */
    constructor($element, aliases) {
        super($element, aliases, TeacherWorkInCompanyStateModifier);
    }
}

class EmploymentGuaranteeStateModifierBuilder extends CheckboxStateModifierBuilder {
    /**
     *
     * @param {{}} $element
     * @param {Array} aliases
     */
    constructor($element, aliases) {
        super($element, aliases, EmploymentGuaranteeStateModifier);
    }
}

class SchoolDataViewer extends DataViewer {
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
        const courses = result.getResult();
        const center = this.urlStateContainer.getCenter();

        courses.sort(function (a, b) {
            return minSchoolDistance(a, center) - minSchoolDistance(b, center);
        });

        const views = [];

        const length = Math.min(courses.length, 20);
        for (let i = 0; i < length; i++) {
            views.push(renderSchool(courses[i]));
        }

        this.$element.html(views.join(""));
    }
}

function minSchoolDistance(school, center) {
    const cities = school.cities;

    let result = distance(cities[0].locations[0], center);

    for (let i = 0; i < cities.length; i++) {
        const city = cities[i];
        const locations = city.locations;

        for (let j = 0; j < locations.length; j++) {
            const location = locations[j];

            result = Math.min(result, distance(location, center));
        }
    }

    return result;
}

function renderSchool(school) {
    const views = [];

    for (let i = 0; i < school.directions.length; i++) {
        const direction = school.directions[i];

        views.push(`<p><a href="${direction.url}" target="_blank">${direction.title}</a></p>`);
    }

    return `
        <div class="row">
            <div class="col s12 work-block z-depth-2 card-panel hoverable">
                <div class="col s12 header">
                    <div class="title"><a href="${school.url}" target="_blank">${school.name}</a></div>
                </div>
                <div class="col s12 message">
                    ${views.join("")}
                </div>
            </div>
        </div>
    `;
}

// </current-project-logic>

(function () {
    const KEY_CODE = {
        ESCAPE: 27,
        ENTER: 13,
        UP: 38,
        DOWN: 40,
        BACKSPACE: 8
    };

    const uniqueKeyChecker = new UniqueKeyChecker();

    const SEARCH_QUERY_DIRECTION = uniqueKeyChecker.unique("direction-query");
    const COURSE_CRITERIA_NAME = uniqueKeyChecker.unique("school-alias");
    const CITY_CRITERIA_NAME = uniqueKeyChecker.unique("city-alias");
    const DIRECTION_CRITERIA_NAME = uniqueKeyChecker.unique("direction-category-alias");
    const FREE_CRITERIA_NAME = uniqueKeyChecker.unique("free");
    const EMPLOYMENT_GUARANTEE_CRITERIA_NAME = uniqueKeyChecker.unique("employment-guarantee");
    const SCHOOL_BY_COMPANY_CRITERIA_NAME = uniqueKeyChecker.unique("school-by-company");
    const EXISTS_PLAN_CRITERIA_NAME = uniqueKeyChecker.unique("exists-plan");
    const TEACHER_WORKS_CRITERIA_NAME = uniqueKeyChecker.unique("teacher-works");

    const multiSelectCriteriaConverter = new MultiSelectCriteriaConverter();
    const multiCheckboxCriteriaConverter = new MultiCheckboxCriteriaConverter();
    const identityCriteriaConverter = new IdentityCriteriaConverter();

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
            [SEARCH_QUERY_DIRECTION]: identityCriteriaConverter,
            [COURSE_CRITERIA_NAME]: multiCheckboxCriteriaConverter,
            [CITY_CRITERIA_NAME]: multiSelectCriteriaConverter,
            [DIRECTION_CRITERIA_NAME]: multiSelectCriteriaConverter,
            [FREE_CRITERIA_NAME]: identityCriteriaConverter,
            [EMPLOYMENT_GUARANTEE_CRITERIA_NAME]: identityCriteriaConverter,
            [SCHOOL_BY_COMPANY_CRITERIA_NAME]: identityCriteriaConverter,
            [EXISTS_PLAN_CRITERIA_NAME]: identityCriteriaConverter,
            [TEACHER_WORKS_CRITERIA_NAME]: identityCriteriaConverter,
        }
    );

    const $directionSearch = $("#js-direction-autocomplete");
    const $courseSearch = $("#js-school-autocomplete");
    const $selectedDirectoryCategoriesContainer = $("#js-selected-directions");
    const $selectedCitiesContainer = $("#js-selected-cities");
    const $selectedCoursesContainer = $("#js-selected-courses");
    let directionAutocompleteCloser = new EmptyCloseComponent();
    let schoolAutocompleteCloser = new EmptyCloseComponent();

    const selectedCourseListView = new AutocompletedCheckboxListListView($selectedCoursesContainer, "course");

    const $freeStatusCheckbox = $("#js-full-free");
    const $teacherWorkInCompanyCheckbox = $("#js-teacher-work-in-company");
    const $employmentGuaranteeCheckbox = $("#js-employment-guarantee");
    const $planExistsCheckbox = $("#js-course-with-plan");
    const $schoolByCompanyCheckbox = $("#js-course-by-company");
    const $linkView = $("#js-nearest-center-companies");

    const application = new Application(
        urlStateContainer,
        new MapViewerManager(new CourseLocationGrouper()),
        new SchoolDataViewer($linkView, urlStateContainer),
        new SchoolStatsViewer(
            $("#js-result-course-count"),
            $("#js-result-direction-count"),
            $("#js-result-city-count")
        ),
        new ApiClient(COURSES_DATA_JSON),
        new CourseArchiver(),
        new FilterContainerBuilder({
            [COURSE_CRITERIA_NAME]: new AliasFilterMatchBuilder($selectedCoursesContainer),
            [FREE_CRITERIA_NAME]: new FreeStatusFilterMatchBuilder($freeStatusCheckbox, urlStateContainer.getCriteriaByName(FREE_CRITERIA_NAME)),
            [EXISTS_PLAN_CRITERIA_NAME]: new PlanExistsFilterMatchBuilder($planExistsCheckbox, urlStateContainer.getCriteriaByName(EXISTS_PLAN_CRITERIA_NAME)),
            [SCHOOL_BY_COMPANY_CRITERIA_NAME]: new SchoolByCompanyFilterMatchBuilder($schoolByCompanyCheckbox, urlStateContainer.getCriteriaByName(SCHOOL_BY_COMPANY_CRITERIA_NAME)),
        }, {
            [SEARCH_QUERY_DIRECTION]: new DirectionTitleStateModifierBuilder($directionSearch, urlStateContainer.getCriteriaByName(SEARCH_QUERY_DIRECTION)),
            [DIRECTION_CRITERIA_NAME]: new DirectionCategoryStateModifierBuilder($selectedDirectoryCategoriesContainer),
            [CITY_CRITERIA_NAME]: new CityStateModifierBuilder($selectedCitiesContainer),
            [TEACHER_WORKS_CRITERIA_NAME]: new TeacherWorkInCompanyStateModifierBuilder($teacherWorkInCompanyCheckbox, urlStateContainer.getCriteriaByName(TEACHER_WORKS_CRITERIA_NAME)),
            [EMPLOYMENT_GUARANTEE_CRITERIA_NAME]: new EmploymentGuaranteeStateModifierBuilder($employmentGuaranteeCheckbox, urlStateContainer.getCriteriaByName(EMPLOYMENT_GUARANTEE_CRITERIA_NAME)),
        }),
        new CallbackFilterViewBuilder(function (list) {
            const courseAutocomplete = new CourseAutocomplete(list);

            $directionSearch.autocomplete({
                data: courseAutocomplete.getDirectionNameMap(),
                onAutocomplete: function (name) {
                    application.searchAndRender();
                }
            });

            directionAutocompleteCloser = M.Autocomplete.getInstance($directionSearch);

            $courseSearch.autocomplete({
                data: courseAutocomplete.getSchoolNameMap(),
                onAutocomplete: function (courseName) {
                    const courseAlias = courseAutocomplete.findCourseAliasByName(courseName);

                    selectedCourseListView.addChecked(courseName, courseAlias);

                    $courseSearch.val("");

                    application.searchAndRender();
                }
            });

            selectedCourseListView.render(list, urlStateContainer.getCriteriaByName(COURSE_CRITERIA_NAME));

            schoolAutocompleteCloser = M.Autocomplete.getInstance($courseSearch);

            const cityPriorityListGenerator = new CityPriorityListGenerator();
            const cityListRender = new CityListRender($selectedCitiesContainer);
            cityListRender.render(cityPriorityListGenerator.generate(list), urlStateContainer.getCriteriaByName(CITY_CRITERIA_NAME, []));

            const directionCategoryPriorityListGenerator = new DirectionCategoryPriorityListGenerator();
            const directionCategoryListRender = new DirectionCategoryListRender($selectedDirectoryCategoriesContainer);
            directionCategoryListRender.render(directionCategoryPriorityListGenerator.generate(list), urlStateContainer.getCriteriaByName(DIRECTION_CRITERIA_NAME, []));
        }),
    );

    application.start();

    /**
     *
     * @param event
     * @param {EmptyCloseComponent} closer
     */
    function keyupSearch(event, closer) {
        if (event.keyCode === KEY_CODE.ENTER) {
            application.searchAndRender();

            closer.close();
        } else if (event.keyCode === KEY_CODE.ESCAPE) {
            closer.close();
        }
    }

    $directionSearch.on("keyup", function (event) {
        keyupSearch(event, directionAutocompleteCloser);
    });

    $courseSearch.on("keyup", function (event) {
        keyupSearch(event, schoolAutocompleteCloser);
    });

    const $container = $(".js-container");
    const resultCountComponent = new ResultCountComponent(new SubmitAction(function () {
        application.renderAfterSearch();
    }));

    const inputChange = function () {
        resultCountComponent.setTop($(this).offset().top - $container.offset().top);
        resultCountComponent.showCount(application.searchAndCount());
    };

    $selectedCitiesContainer.on("change", "input", inputChange);
    $selectedCoursesContainer.on("change", "input", inputChange);
    $selectedDirectoryCategoriesContainer.on("change", "input", inputChange);
    $freeStatusCheckbox.on("change", inputChange);
    $planExistsCheckbox.on("change", inputChange);
    $employmentGuaranteeCheckbox.on("change", inputChange);
    $schoolByCompanyCheckbox.on("change", inputChange);
    $teacherWorkInCompanyCheckbox.on("change", inputChange);

    $("#js-search-submit").click(function () {
        application.searchAndRender();
    });

    $("#js-tabs").tabs();
    $("#js-sync-list-result").click(function () {
        application.renderLinks();
    });
})();