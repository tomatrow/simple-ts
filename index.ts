import { spawn, ChildProcessWithoutNullStreams } from "child_process"
import { Readable } from "stream"

export const REMARKABLE_SCREEN_SIZE = { width: 1380, height: 1820 }
export const FONT_SIZE_TO_CHARACTER_HEIGHT = 1.3125
export const FONT_SIZE_TO_CHARACTER_WIDTH = 1 / 1.7
export const DEFAULT_SIMPLE_PATH = "/opt/bin/simple"
export const PROBLEM_LETTERS = "ěščřžýáíéúů"

export interface Rect {
    x: number
    y: number
    width: number
    height: number
}

export const WIDGET_TYPES = {
    label: "label",
    paragraph: "paragraph",
    button: "button",
    textinput: "textinput",
    textarea: "textarea",
    image: "image",
    range: "range",
    canvas: "canvas"
} as const
export type WIDGET_TYPE = (typeof WIDGET_TYPES)[keyof typeof WIDGET_TYPES]

export const JUSTIFY_TYPES = {
    left: "left",
    center: "center",
    right: "right"
} as const
export type JUSTIFY_TYPE = (typeof JUSTIFY_TYPES)[keyof typeof JUSTIFY_TYPES]

export type SimpleCommand =
    | { type: "label"; id: string; rect: Rect; value: string }
    | { type: "paragraph"; id: string; rect: Rect; value: string }
    | { type: "button"; id: string; rect: Rect; value: string }
    | { type: "textinput"; id: string; rect: Rect; value: string }
    | { type: "textarea"; id: string; rect: Rect; value: string }
    | { type: "range"; id: string; rect: Rect; min: number; max: number; value: number }
    | { type: "image"; id: string; rect: Rect; path: string }
    | { type: "canvas"; id: string; rect: Rect; rawPath: string; pngPath: string }
    | { type: "justify"; justify: JUSTIFY_TYPE }
    | { type: "fontsize"; fontSize: number }
    | { type: "timeout"; timeout: number }
    | { type: "noclear" }

export type SimpleEvent =
    | { type: "selection"; id: string }
    | { type: "input"; id: string; value: string }
    | { type: "range"; id: string; value: number }

export function repairDiacritics(text: string) {
    if (!text) return text
    let i = 0
    for (const letter of text) {
        if (PROBLEM_LETTERS.toUpperCase().includes(letter)) {
            if (i !== 0) {
                text = text.slice(0, i) + letter.toLowerCase() + text.slice(i + 1)
            } else {
                text = letter.toLowerCase() + text.slice(i + 1)
            }
        }
        i++
    }
    if (PROBLEM_LETTERS.includes(text.slice(-1))) text += "."
    return text
}

export function stringifySimpleCommand(command: SimpleCommand) {
    switch (command.type) {
        case "label":
        case "paragraph":
        case "button":
        case "textinput":
        case "textarea":
            const { type, id, rect, value } = command
            let result = [
                id ? `${type}:${id}` : type,
                rect.x,
                rect.y,
                rect.width,
                rect.height
            ].join(" ")
            if (value) result += " " + repairDiacritics(value)
            if (type === WIDGET_TYPES.textarea || type === WIDGET_TYPES.paragraph)
                result = `[${result}]`
            return result
        case "range": {
            const { type, id, rect, min, max, value } = command
            return [
                id ? `${type}:${id}` : type,
                rect.x,
                rect.y,
                rect.width,
                rect.height,
                min,
                max,
                value
            ].join(" ")
        }
        case "image": {
            const { type, id, rect, path } = command
            return [
                id ? `${type}:${id}` : type,
                rect.x,
                rect.y,
                rect.width,
                rect.height,
                path
            ].join(" ")
        }
        case "canvas": {
            const { type, id, rect, rawPath, pngPath } = command
            return [
                id ? `${type}:${id}` : type,
                rect.x,
                rect.y,
                rect.width,
                rect.height,
                rawPath,
                pngPath
            ].join(" ")
        }
        case "justify":
            const { justify } = command
            return `@justify ${justify}`
        case "fontsize":
            const { fontSize } = command
            return `@fontsize ${fontSize}`
        case "timeout":
            const { timeout } = command
            return `@timeout ${timeout}`
        case "noclear":
            return "@noclear"
    }
}

export function calculateTextWidgetSize(fontSize: number, value: string) {
    const lines = value.split("\n")
    const rows = lines.length
    const columns = Math.max(...lines.map(line => line.length))
    return {
        width: fontSize * FONT_SIZE_TO_CHARACTER_WIDTH * columns,
        height: fontSize * FONT_SIZE_TO_CHARACTER_HEIGHT * rows
    }
}

function parseSimpleOutput(output: string): SimpleEvent | undefined {
    if (output.startsWith("selected:")) {
        const button = output.slice(10).trim()
        return { type: "selection", id: button }
    } else if (output.startsWith("input:")) {
        const [id, value] = output.slice(7).split(" : ")
        return {
            type: "input",
            id,
            value: value.trim()
        }
    } else if (output.startsWith("range:")) {
        const [id, value] = output.slice(7).split(" : ")
        return {
            type: "range",
            id,
            value: Number(value.trim())
        }
    } else {
        console.warn(`unknown simple output '${output}'`)
    }
}

function getSimpleShellCommand(commands: SimpleCommand[]) {
    return commands.map(stringifySimpleCommand).join("\n")
}

export function executeSimpleScript(...commands: []) {
    let process: ChildProcessWithoutNullStreams
    const promise = new Promise<string>((resolve, reject) => {
        const input = getSimpleShellCommand(commands)

        process = spawn(DEFAULT_SIMPLE_PATH)
        let stdout = ""
        process.stdout.on("data", data => {
            stdout = data.toString()
        })
        process.stdout.on("error", error => {
            reject(error)
        })
        process.stdout.on("close", () => {
            resolve(stdout)
        })
        const stream = new Readable()
        stream.push(input)
        stream.push(null)
        stream.pipe(process.stdin)
    }).then(parseSimpleOutput)
    return Object.assign(promise, {
        cancel() {
            process?.kill()
        }
    })
}
