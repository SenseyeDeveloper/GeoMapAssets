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