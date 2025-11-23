/**
 * Class that processes apex code to determine the class and method boundaries
 *
 * Algorithm O(n):
 *   1) First we convert all the code to lower case. We do this because apex is case-insensitive.
 *   2) We convert all strings and comments in the code to be blank spaces so that the text in the strings and
 *      comments don't accidentally trick our parsing algorithm with strings like "class" and "}".
 *   3) We initialize an array called lineMarkers which will end up being the same length of the number of lines
 *      in the apex code, but we start with just a single element as we assume the code as at least 1 line. The
 *      elements of themselves arrays of ApexLineMarker enums so that we can mark each line zero or more markers.
 *   4) Walking through character by character, we look for:
 *      - '\n' - to increment the current line number
 *      - '(' and ')' - so that we can keep track of the depth of parentheses
 *      - '{' and '}' - so that we can keep track of the depth of the brackets
 *      - "class " (at start) or " class " - so we can mark where a ClassStart boundary is and mark the class depth
 *   5) Using information about the depths, as we walk we:
 *      - Mark a ClassEnd boundary on a line that contains a "}" that lives at the same depth as the class depth
 *      - Mark a MethodStart boundary on a line that contains the last alphabet character that is not contained
 *        inside parentheses that precedes a "{" that lives at a depth that is one more than the class depth.
 *          - Basically, we assume that the line containing this last alphabet character is a part of the method
 *            name. Note we don't want the line containing the "{" because that can be on a different line than
 *            the name of the method and is also after the argument list. So to ensure we get the entire method
 *            signature, including the argument list, we look for this last alphabet character prior to characters
 *            that live inside of parenthesis.
 *      - Mark a MethodEnd boundary on a line that contains a "}" that lives at a depth that is one more than the
 *        class depth.
 *
 * @param apexCode The file contents of an apex class file
 * @return An ApexBoundaryMarkings instance
 */
export class ApexCodeBoundaries {
    private readonly lineMarkers: ApexLineMarker[][];

    private constructor(lineMarkers: ApexLineMarker[][]) {
        this.lineMarkers = lineMarkers;
    }

    static forApexCode(apexCode: string): ApexCodeBoundaries {
        const code: string = makeBlankAllCommentsAndStringsFromApexCode(apexCode.toLowerCase());

        let lineNum: number = 0;
        let classDepth: number = 0;
        let bracketDepth: number = 0;
        let lineNumOfLastWordCharBeforeDepth0Paren: number = 0;
        let parenDepth: number = 0;

        // We always have at least 1 line of code, so we initialize the ApexLineMarker[] array for the first line here.
        const lineMarkers: ApexLineMarker[][] = [[]];
        for (let i: number = 5; i < code.length; i++) { // Start at i=5 because "class " is the first thing we can look for anyway
            const char: string = code[i];

            // If we are at the start of a file or the 6th previous character was whitespace, then we check to see if we
            // found the string "class " (where ' ' is the current character). If so, then we add a ClassStart marker.
            if ( char === ' ' &&
                (i === 5 || (i > 5 && /\s/.test(code[i-6]))) &&
                (code[i-5] ==='c' && code[i-4] === 'l' && code[i-3] === 'a' && code[i-2] === 's' && code[i-1] === 's')) {
                lineMarkers[lineNum].push(ApexLineMarker.ClassStart);
                classDepth = bracketDepth; // We mark the depth of this (possibly inner) class based on the current bracket depth.
            } else if (char === '\n') {
                lineNum++;
                lineMarkers.push([]);
            } else if (char === '(') {
                parenDepth++;
            } else if (char == ')') {
                parenDepth--;
            } else if (char === '{') {
                if (bracketDepth === classDepth + 1) { // Should be the start of a method body
                    // But we mark the start of a method to be the line associated with where the method name is
                    lineMarkers[lineNumOfLastWordCharBeforeDepth0Paren].push(ApexLineMarker.MethodStart)
                }
                bracketDepth++;
            } else if (char === '}') {
                bracketDepth--;
                if (bracketDepth === classDepth) { // Should be the end of class body
                    lineMarkers[lineNum].push(ApexLineMarker.ClassEnd)
                    classDepth--; // Need to adjust class depth to handle inner class cases
                } else if (bracketDepth === classDepth + 1) { // Should be the end of a method body
                    lineMarkers[lineNum].push(ApexLineMarker.MethodEnd)
                }
            } else if (/[a-z]/.test(char) && parenDepth === 0) {
                lineNumOfLastWordCharBeforeDepth0Paren = lineNum;
            }
        }
        return new ApexCodeBoundaries(lineMarkers);
    }

    isStartOfClass(lineNum: number): boolean {
        return this.lineMarkers[lineNum].includes(ApexLineMarker.ClassStart);
    }

    isEndOfClass(lineNum: number): boolean {
        return this.lineMarkers[lineNum].includes(ApexLineMarker.ClassEnd);
    }

    isStartOfMethod(lineNum: number): boolean {
        return this.lineMarkers[lineNum].includes(ApexLineMarker.MethodStart);
    }

    isEndOfMethod(lineNum: number): boolean {
        return this.lineMarkers[lineNum].includes(ApexLineMarker.MethodEnd);
    }

    getClassStartLines(): number[] {
        return this.lineMarkers
            .map((_, lineNum) => lineNum)
            .filter(lineNum => this.isStartOfClass(lineNum));
    }

    getClassEndLines(): number[] {
        return this.lineMarkers
            .map((_, lineNum) => lineNum)
            .filter(lineNum => this.isEndOfClass(lineNum));
    }

    getMethodStartLines(): number[] {
        return this.lineMarkers
            .map((_, lineNum) => lineNum)
            .filter(lineNum => this.isStartOfMethod(lineNum));
    }

    getMethodEndLines(): number[] {
        return this.lineMarkers
            .map((_, lineNum) => lineNum)
            .filter(lineNum => this.isEndOfMethod(lineNum));
    }

    isEndOfCode(lineNum: number): boolean {
        return lineNum === (this.lineMarkers.length - 1);
    }

    /**
     * Finds the start line of the class that contains the given line number.
     * Increment a counter for each ClassEnd (nested class to skip) and decrement for each ClassStart.
     * When counter reaches 0 at a ClassStart, that's the containing class.
     * Time Complexity: O(lineNum)
     * 
     * @param lineNum The line number to search from
     * @returns The line number where the containing class starts, or undefined if no class contains the line
     */
    getStartLineOfClassThatContainsLine(lineNum: number): number | undefined {
<<<<<<< HEAD
        let depth = 0;

        for (let i = lineNum; i >= 0; i--) {
            depth += i < lineNum && this.isEndOfClass(i) ? 1 : 0;

            if (this.isStartOfClass(i)) {
                if (depth === 0) {
                    return i;
                }
                depth--;
            }
        }

        return undefined;
=======
        let value = 1; // Counter to keep track starting and ending of classes seen
        let skipFirstEnd = this.isEndOfClass(lineNum); // This is to track if we are at the end of the class for the lineNum
        
        // Iterate backwards from lineNum to find the start line of the containing class
        for (let i = lineNum; i >= 0; i--) {
            if (this.isStartOfClass(i)) {
                value--;
                if (value === 0) {
                    return i; // Found the containing class
                }
            } else if (this.isEndOfClass(i)) {
                if (skipFirstEnd) {
                    skipFirstEnd = false; // Skip the first ClassEnd if we started on one
                } else {
                    value++; // There's a nested class ahead we need to skip
                }
            }
        }
        
        return undefined; // No class contains this line
>>>>>>> fb6535c (addressing review comments)
    }

    /**
     * Finds the end line of the class that contains the given line number.
     * Searches forwards from the given line to find the nearest ClassEnd marker that matches
     * the class depth of the containing class.
     * 
     * @param lineNum The line number to search from
     * @returns The line number where the containing class ends, or undefined if no class contains the line
     */
    getEndLineOfClassThatContainsLine(lineNum: number): number | undefined {
        // First, find the start of the class
        const classStartLine = this.getStartLineOfClassThatContainsLine(lineNum);
        if (classStartLine === undefined) {
            return undefined;
        }

        // Count nested classes that start after the containing class start
        let nestedClassCount = 0;
        for (let i = classStartLine + 1; i < this.lineMarkers.length; i++) {
            if (this.isStartOfClass(i)) {
                nestedClassCount++;
            } else if (this.isEndOfClass(i)) {
<<<<<<< HEAD
                nestedClassCount--;
                if (nestedClassCount < 0) {
                    return i; // This is the end of our containing class
=======
                // If we've seen nested classes, this end belongs to one of them
                if (nestedClassCount > 0) {
                    nestedClassCount--;
                } else {
                    // This is the end of our containing class
                    return i;
>>>>>>> fb6535c (addressing review comments)
                }
            }
        }
        return undefined;
    }
}

enum ApexLineMarker {
    ClassStart = 'ClassStart',
    ClassEnd = 'ClassEnd',
    MethodStart = 'MethodStart',
    MethodEnd = 'MethodEnd',
}


/**
 * Helper function to remove all text from the comments and strings with apex code to make the lines of code
 * safe to process with regular expressions
 *
 * Algorithm O(n):
 *   1) Walking through the code character by character, we look for:
 *      - "'" - to help track whether we are in a string or not
 *      - "//" - to see if we are in a single comment or not
 *      - "/*" and * followed by / - to see if we are in a multi-line comment or not
 *   2) We rebuild the apexCode string into a new string one character at a time:
 *      - We always preserve '\n' and '\r' characters regardless of where they are found
 *      - If we are in a string, then we replace each character with a space ' '
 *      - If we are in a comment, then we replace each character in the comment with a space ' ' and even remove the
 *        comment markers themselves with spaces.
 * @param apexCode
 */
export function makeBlankAllCommentsAndStringsFromApexCode(apexCode: string): string {
    let result: string = '';
    let inString: boolean = false;
    let inSingleLineComment: boolean = false;
    let inMultiLineComment: boolean = false;

    for (let i: number = 0; i < apexCode.length; i++) {
        const char: string = apexCode[i];
        const prevChar: string = i === 0 ? '' : apexCode[i - 1];
        const nextChar: string = i + 1 === apexCode.length ? '' : apexCode[i + 1];

        if (inString) {
            if (char === "'" && prevChar !== '\\') { // End of string
                result += "'"; // Preserve the closing quote
                inString = false;
            } else {
                result += ' '; // Make the text inside a string blank, preserving the number of characters
            }
        } else if (inSingleLineComment) {
            if (char === '\n' || char === '\r') {
                inSingleLineComment = false; // End of single-line comment
                result += char; // Preserve the newline characters
            } else {
                result += ' '; // Make the text in the single line comment blank, preserving the number of characters
            }
        } else if (inMultiLineComment) {
            if (char === '\n' || char === '\r') {
                result += char; // Preserve the newline
            } else if (char === '*' && nextChar === '/') { // End of multi-line comment
                result += '  '; // Make blank the end of the multi line comment markers
                i++;
                inMultiLineComment = false; // End of multi-line comment
            } else {
                result += ' '; // Make the text in the multi line comment blank, preserving the number of characters
            }
        } else {
            if (char === "'") {
                inString = true;
                result += char; // Preserve the opening quote
            } else if (char === '/' && nextChar === '/') {
                inSingleLineComment = true;
                result += '  '; // Make blank the single line comment markers
                i++;
            } else if (char === '/' && nextChar === '*') {
                inMultiLineComment = true;
                result += '  '; // Make blank the multi-line comment markers
                i++;
            } else {
                result += char; // Add regular character
            }
        }
    }
    return result;
}
