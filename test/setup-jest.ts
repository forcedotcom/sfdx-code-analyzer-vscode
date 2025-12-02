// Note that the vscode module isn't actually available to be imported inside of jest tests because
// it requires the VS Code window to be running as well. That is, it is not supplied by the node engine,
// but is supplied by the vscode engine. So we must mock out this module here to allow the
// "import * as vscode from 'vscode'" to not complain when running jest tests (which run with the node engine).

import * as jestMockVscode from 'jest-mock-vscode';

function getMockVSCode() {
    return {
        // Using a 3rd party library to help create the mocks instead of creating them all manually
        ... jestMockVscode.createVSCodeMock(jest),


        // Defining Hover since it is missing from jest-mock-vscode
        "Hover": class Hover {
            public readonly contents: any[];
            public readonly range?: any;

            constructor(contents: any | any[], range?: any) {
                this.contents = Array.isArray(contents) ? contents : [contents];
                this.range = range;
            }
        }
    };
}
jest.mock('vscode', getMockVSCode, {virtual: true})
