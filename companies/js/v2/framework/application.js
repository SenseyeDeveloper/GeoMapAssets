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