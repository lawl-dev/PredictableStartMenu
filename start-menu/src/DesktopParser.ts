import { read, readdir } from 'fs';

export class DesktopParser {
    static parseDesktopFile(path: string, data: Buffer): DesktopFile {
        const text = data.toString();
        const lines = text.split("\n");

        const result: DesktopFile = {
            location: path,
            name: "",
            exec: "",
            categories: [],
            keywords: [],
            notShowIn: [],
            onlyShowIn: []
        };

        let state: "skip" | "parse" = "skip";
        for (const line of lines) {
            if (line.startsWith("[")) {
                if (line.startsWith("[Desktop Entry]")) {
                    state = "parse";
                }
                else {
                    state = "skip";
                }
            }

            if (state === "skip") {
                continue;
            }

            if (line.startsWith("Name=")) {
                result.name = line.substring("Name=".length).trimEnd();
            }
            if (line.startsWith("Exec=")) {
                result.exec = line.substring("Exec=".length).trimEnd();
            }
            if (line.startsWith("Icon=")) {
                result.icon = line.substring("Icon=".length).trimEnd();
            }
            if (line.startsWith("Comment=")) {
                result.comment = line.substring("Comment=".length).trimEnd();
            }
            if (line.startsWith("Categories=")) {
                result.categories = line.substring("Categories=".length).trimEnd().split(";").filter(x => x.trim() != "");
            }
            if (line.startsWith("Keywords=")) {
                result.keywords = line.substring("Keywords=".length).trimEnd().split(";").filter(x => x.trim() != "");
            }
            if (line.startsWith("NoDisplay=")) {
                result.noDisplay = line.substring("NoDisplay=".length).trimEnd().toLocaleLowerCase() === "true";
            }
            if (line.startsWith("OnlyShowIn=")) {
                result.onlyShowIn = line.substring("OnlyShowIn=".length).trimEnd().split(";").filter(x => x.trim() != "");
            }
            if (line.startsWith("NotShowIn=")) {
                result.notShowIn = line.substring("NotShowIn=".length).trimEnd().split(";").filter(x => x.trim() != "");
            }
            if (line.startsWith("Description=")) {
                result.description = line.substring("Description=".length).trimEnd();
            }
        }

        return result;
    }
}

export interface DesktopFile {
    location: string;
    name: string;
    exec: string;
    description?: string;
    icon?: string;
    comment?: string;
    keywords: string[];
    noDisplay?: boolean;
    onlyShowIn: string[];
    notShowIn: string[];
    categories: string[]
}
