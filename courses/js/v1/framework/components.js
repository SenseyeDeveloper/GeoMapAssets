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
