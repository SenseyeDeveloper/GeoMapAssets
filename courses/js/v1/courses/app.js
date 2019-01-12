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