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