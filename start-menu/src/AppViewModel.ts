import { Component, Vue } from "vue-property-decorator";
import { DesktopFile, DesktopParser } from './DesktopParser';
import { readdir, readFile } from 'fs';
import fs from "fs";
import { exec } from "child_process";
import { ipcRenderer, app } from 'electron';

@Component({
    components: {}
})
export default class AppViewModel extends Vue {
    public selectionIndex = 0
    public searchTerm: string = "";
    public themeName: string | undefined;
    public username: string = null!;

    // already sorted by name desc
    public applicationSuggestions: ApplicationSuggestion[] = [];
    public filteredApplicationSuggestions: ApplicationSuggestion[] = [];
    public lastSelectedSuggestionBySearchTerm: Record<string, string> = {};
    private isVisible = false;

    public async mounted(): Promise<void> {
        this.themeName = await this.getThemeNameAsync()
        this.username = await this.getUsernameAsync()
        await this.loadSuggestionWeightsAsync();
        await this.loadApplicationSuggestionsAsync();

        ipcRenderer.on('hide', () => {
            this.isVisible = false;
        });

        ipcRenderer.on('show', () => {
            this.isVisible = true;
            setTimeout(() => {
                if (this.$refs.searchInput) {
                    this.updateSearch("");
                    (this.$refs.searchInput as HTMLInputElement).focus();
                }
            }, 0);
        });

        Vue.nextTick(() => (this.$refs.searchInput as HTMLInputElement).focus());
    }

    public hide(): void {
        ipcRenderer.send("hide-me");
    }

    public title(suggestion: ApplicationSuggestion): string {
        return "" +
            "exec: " + suggestion.exec + "\n" +
            "icon: " + suggestion.iconPath + "\n" +
            "categories: " + suggestion.categories.join(", ") + "\n" +
            "description: " + suggestion.description + "\n" +
            "location of desktop file: " + suggestion.desktopFileLocation;
    }

    public async exec(suggestion: ApplicationSuggestion): Promise<void> {
        if (!this.isVisible) {
            return;
        }

        if (suggestion.isInternal) {
            this.execInternalAction(suggestion);
        }

        const ignoreFieldCodes = (exec: string) => {
            return exec
                .replace("%f", "")
                .replace("%u", "")
                .replace("%F", "")
                .replace("%U", "");
        };

        exec(ignoreFieldCodes(suggestion.exec), { cwd: "/home/" + this.username });
        if (this.searchTerm !== "") {
            this.lastSelectedSuggestionBySearchTerm[this.searchTerm] = suggestion.name;
            await this.writeFileAsync("/home/" + this.username + "/.StartMenu/lastSelectedSuggestionBySearchTerm.json", this.lastSelectedSuggestionBySearchTerm);
        }
    }

    public isPartOfMatch(index: number, suggestion: ApplicationSuggestion): boolean {
        for (const match of suggestion.matches) {
            if (match.matchingIndexes.indexOf(index) !== -1) {
                return true;
            }
        }

        return false;
    }

    public updateSearch(searchTerm: string): void {
        this.searchTerm = searchTerm;
        const lowerSearchTerm = searchTerm.toLocaleLowerCase();
        if (this.searchTerm.trim() != "") {
            const newFilteredApplicationSuggestions: Array<ApplicationSuggestion | null> = [];

            // find sequence matches like "Telegr[A]m Deskt[O]p" for the search term "ao"  
            for (const suggestion of this.applicationSuggestions) {
                suggestion.matches.splice(0);

                const matchingIndexes: number[] = [];
                let index = 0
                for (; index < lowerSearchTerm.length; index++) {
                    const char = lowerSearchTerm[index];
                    const lastMatchIndex = matchingIndexes.length === 0 ? 0 : matchingIndexes[matchingIndexes.length - 1];
                    const charIndex = suggestion.name.toLocaleLowerCase().indexOf(char, lastMatchIndex + 1);
                    if (charIndex === -1) {
                        break
                    }
                    matchingIndexes.push(charIndex);
                    if (index === lowerSearchTerm.length - 1) {
                        suggestion.matches.push({ matchingIndexes })
                        newFilteredApplicationSuggestions.push(suggestion);
                    }
                }
            }

            const range = (start: number, count: number) => {
                const indexes: number[] = [];
                for (let i = start; i <= start + count; i++) {
                    indexes.push(i);
                }
                return indexes;
            }

            // find contains matches like "Tele[GRAM] Desktop" for the search term "gram"
            for (const suggestion of this.applicationSuggestions) {
                const newValueIndex = suggestion.name.indexOf(lowerSearchTerm);
                if (suggestion.name.toLocaleLowerCase().indexOf(lowerSearchTerm) === -1) {
                    continue;
                }

                const matchingIndexes = range(newValueIndex, lowerSearchTerm.length);
                suggestion.matches.push({ matchingIndexes })
                newFilteredApplicationSuggestions.push(suggestion);
            }

            // find starting letter matches like "[T]elegram [D]esktop" for the search term "TD" (lowercase letters count as starting letter too)
            for (const suggestion of this.applicationSuggestions) {
                let startingLetters = "";
                let startingLetterIndexes: number[] = [];
                for (let index = 0; index < suggestion.name.length; index++) {
                    const char = suggestion.name[index];
                    const isUpperCase = char === char.toUpperCase();
                    const charCode = char.charCodeAt(0);
                    const isLetter = (charCode >= 65 && charCode < 91) || (charCode >= 97 && charCode < 123)
                    if (isUpperCase && isLetter) {
                        startingLetters += char.toLocaleLowerCase(); // "VisualStudio" = vs
                        startingLetterIndexes.push(index)
                        continue;
                    }

                    if (index > 0 && suggestion.name[index - 1] === " ") {
                        const char = suggestion.name[index - 1];
                        const charCode = char.charCodeAt(0);
                        const isLetter = (charCode >= 65 && charCode < 91) || (charCode >= 97 && charCode < 123)
                        if (isLetter) {
                            startingLetters += suggestion.name[index - 1].toLocaleLowerCase(); // "VisualStudio code" = vsc
                            startingLetterIndexes.push(index - 1)
                        }
                    }
                }

                const newValueIndex = startingLetters.indexOf(lowerSearchTerm);
                if (newValueIndex !== -1) {
                    const matchingIndexes = startingLetterIndexes.filter((_, index) => index >= newValueIndex && index <= newValueIndex + lowerSearchTerm.length);
                    suggestion.matches.push({ matchingIndexes })
                    newFilteredApplicationSuggestions.push(suggestion);
                }
            }

            if (this.lastSelectedSuggestionBySearchTerm[searchTerm]) {
                const lastSelectedSuggestionBySearchTerm = this.applicationSuggestions.find(x => x.name == this.lastSelectedSuggestionBySearchTerm[searchTerm]);
                if (lastSelectedSuggestionBySearchTerm) {
                    newFilteredApplicationSuggestions.push(lastSelectedSuggestionBySearchTerm);
                }
            }

            var seenMatches = new Set<ApplicationSuggestion>();
            for (let index = newFilteredApplicationSuggestions.length - 1; index >= 0; index--) {
                if (seenMatches.has(newFilteredApplicationSuggestions[index]!)) {
                    newFilteredApplicationSuggestions[index] = null;
                    continue;
                }

                seenMatches.add(newFilteredApplicationSuggestions[index]!);
            }


            this.filteredApplicationSuggestions = newFilteredApplicationSuggestions.filter(x => x != null) as ApplicationSuggestion[];
        }
        else {
            const newFilteredApplicationSuggestions: Array<ApplicationSuggestion> = [];

            for (const suggestion of this.applicationSuggestions) {
                suggestion.matches.splice(0);
                newFilteredApplicationSuggestions.push(suggestion);
            }

            this.filteredApplicationSuggestions = newFilteredApplicationSuggestions;
        }

        this.selectionIndex = this.filteredApplicationSuggestions.length - 1;
        Vue.nextTick(() => (this.$refs.suggestionContainer as HTMLElement).scrollTop = (this.$refs.suggestionContainer as HTMLElement).scrollHeight)
    }

    public updateSelectionIndex(event: KeyboardEvent): void {
        if (event.key === "ArrowUp") {
            if (this.selectionIndex <= 0) {
                return;
            }

            this.selectionIndex--;
            return;
        }

        if (event.key === "ArrowDown") {
            if (this.selectionIndex >= this.filteredApplicationSuggestions.length - 1) {
                return;
            }

            this.selectionIndex++;
        }

        if (event.key === "Enter") {
            this.exec(this.filteredApplicationSuggestions[this.selectionIndex]);

            this.hide();
        }
    }

    private execInternalAction(suggestion: ApplicationSuggestion): void {
        switch (suggestion.name) {
            case "refresh-suggestion-list":
                this.loadApplicationSuggestionsAsync();
                break
            case "restart-start-menu":
                app.relaunch();
                app.exit();
                break;
            case "shutdown-start-menu":
                app.exit();
                break;
        }
    }

    private async loadSuggestionWeightsAsync(): Promise<void> {
        if (!await this.existsAsync("/home/" + this.username + "/.StartMenu/")) {
            await this.mkdirAsync("/home/" + this.username + "/.StartMenu/");
            await this.writeFileAsync("/home/" + this.username + "/.StartMenu/lastSelectedSuggestionBySearchTerm.json", {});
        }

        const buffer = await this.readFileAsync("/home/" + this.username + "/.StartMenu/lastSelectedSuggestionBySearchTerm.json");
        const lastSelectedSuggestionBySearchTerm = JSON.parse(buffer.toString());
        this.lastSelectedSuggestionBySearchTerm = lastSelectedSuggestionBySearchTerm;
    }

    private async loadApplicationSuggestionsAsync(): Promise<void> {
        this.applicationSuggestions.splice(0);

        const desktopFiles = await this.readDesktopFilesAsync();
        for (const desktopFile of desktopFiles.map(x => x)) {
            if (desktopFile.noDisplay === true) {
                continue;
            }

            if (desktopFile.notShowIn.some(x => x.toLocaleLowerCase().indexOf("kde") !== -1)) {
                continue;
            }

            if (desktopFile.onlyShowIn.length > 0 && !desktopFile.onlyShowIn.some(x => x.toLocaleLowerCase().indexOf("kde") !== -1)) {
                continue;
            }

            if (this.applicationSuggestions.find(x => x.name === desktopFile.name && x.exec === desktopFile.exec)) {
                continue;
            }

            this.applicationSuggestions.push({
                isInternal: false,
                desktopFileLocation: desktopFile.location,
                name: desktopFile.name,
                exec: desktopFile.exec,
                iconPath: await this.iconPath(desktopFile),
                description: desktopFile.description,
                categories: desktopFile.categories,
                comment: desktopFile.comment,
                matches: []
            });
        }

        this.applicationSuggestions.push({
            isInternal: true,
            exec: "",
            name: "refresh-suggestion-list",
            matches: [],
            categories: []
        });
        this.applicationSuggestions.push({
            isInternal: true,
            exec: "",
            name: "restart-start-menu",
            matches: [],
            categories: []
        });
        this.applicationSuggestions.push({
            isInternal: true,
            exec: "",
            name: "shutdown-start-menu",
            matches: [],
            categories: []
        });

        this.applicationSuggestions.sort((a, b) => a.name.localeCompare(b.name)).reverse()
    }

    private async iconPath(desktopFile: DesktopFile): Promise<string> {
        const isPath = desktopFile.icon?.indexOf("/") != -1;
        if (isPath) {
            return desktopFile.icon!;
        }

        const basePaths = ["/usr/share/icons/", "/home/" + this.username + "/.local/share/icons/"];
        const sizes = ["128x128", "64x64", "32x32", "16x16"];
        const categories = ["apps", "panel"];
        const extensions = ["svg", "png", "jpg", "jpeg", "gif", "bmp"];
        const themes: string[] = ["hicolor"];
        if (this.themeName) {
            themes.unshift(this.themeName);
        }

        for (const theme of themes) {
            for (const size of sizes) {
                for (const basePath of basePaths) {
                    for (const category of categories) {
                        for (const extension of extensions) {
                            const location = basePath + theme + "/" + size + "/" + category + "/" + desktopFile.icon + "." + extension;
                            if (await this.existsAsync(location)) {
                                return location;
                            }
                        }
                    }
                }
            }
        }

        return "";
    }

    private async existsAsync(path: string): Promise<boolean> {
        let resolve: (result: boolean) => void;
        const promise = new Promise<boolean>((_resolve) => resolve = _resolve);
        fs.access(path, (error) => {
            resolve(error == undefined);
        });
        return promise;
    }

    private async mkdirAsync(path: string): Promise<void> {
        let resolve: () => void;
        const promise = new Promise<void>((_resolve) => resolve = _resolve);
        fs.mkdir(path, () => resolve());
        return promise;
    }

    private async writeFileAsync(path: string, data: object): Promise<void> {
        let resolve: () => void;
        const promise = new Promise<void>((_resolve) => resolve = _resolve);
        fs.writeFile(path, JSON.stringify(data), () => resolve());
        return promise;
    }

    private async getThemeNameAsync(): Promise<string | undefined> {
        let resolve: (stdout: string | undefined) => void;
        const promise = new Promise<string | undefined>((_resolve) => resolve = _resolve);
        exec(`kreadconfig5 --group "Icons" --key "Theme"`, (_, result) => {
            resolve(result.substring(0, result.length - 1));
        });

        return promise;
    }

    private async getUsernameAsync(): Promise<string> {
        let resolve: (stdout: string) => void;
        const promise = new Promise<string>((_resolve) => resolve = _resolve);
        exec("whoami", (_, result) => {
            resolve(result.substring(0, result.length - 1));
        });

        return promise;
    }

    private async readDesktopFilesAsync(): Promise<DesktopFile[]> {
        const applicationPaths = [
            "/usr/share/applications/",
            "/var/lib/snapd/desktop/applications/",
            "/home/" + this.username + "/Desktop/",
            "/home/" + this.username + "/.local/share/applications/",
            "/usr/local/share/applications/",
            "/var/lib/flatpak/exports/share/applications/"
        ];

        const result: DesktopFile[] = [];
        for (const applicationPath of applicationPaths) {
            if (!await this.existsAsync(applicationPath)) {
                continue;
            }

            const files = await this.readdirAsync(applicationPath);
            for (const file of files) {
                if (!file.endsWith(".desktop")) {
                    continue;
                }

                const data = await this.readFileAsync(applicationPath + file);
                result.push(DesktopParser.parseDesktopFile(applicationPath + file, data));
            }
        }

        return result;
    }

    private async readdirAsync(path: string): Promise<string[]> {
        let resolve: (files: string[]) => void;
        const promise = new Promise<string[]>((_resolve) => resolve = _resolve);

        readdir(path, (_, files) => {
            resolve(files);
        });

        return promise;
    }

    private async readFileAsync(path: string): Promise<Buffer> {
        let resolve: (data: Buffer) => void;
        const promise = new Promise<Buffer>((_resolve) => resolve = _resolve);

        readFile(path, (_, data) => {
            resolve(data);
        })

        return promise;
    }
}


interface ApplicationSuggestion {
    isInternal: boolean;
    desktopFileLocation?: string;
    name: string;
    exec: string;
    iconPath?: string;
    description?: string;
    comment?: string;
    categories: string[]

    matches: Array<{ matchingIndexes: number[] }>
}
