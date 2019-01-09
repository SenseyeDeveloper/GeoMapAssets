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
