import {
    ApexCodeBoundaries,
    makeBlankAllCommentsAndStringsFromApexCode
} from "../../src/lib/apex-code-boundaries";

describe('Tests for the ApexCodeBoundaries class', () => {
    it('When file starts with the word "class" and the class ends on same line', () => {
        const apexCode: string =
            'class MyClass {}';
        const boundaries: ApexCodeBoundaries = ApexCodeBoundaries.forApexCode(apexCode);
        expect(boundaries.getClassStartLines()).toEqual([0]);
        expect(boundaries.getClassEndLines()).toEqual([0]);
        expect(boundaries.getMethodStartLines()).toEqual([]);
        expect(boundaries.getMethodEndLines()).toEqual([]);
    });

    it('When class does not start on first line', () => {
        const apexCode: string =
            '// Some comment\n' +
            'protected class HelloWorld {\n' +
            '    void someMethod1() {\n' +
            '        // no-op with ( {} ) {} symbols } that should ( be ignored\n' +
            '    }\n' +
            '    void someMethod2() {}\n' +
            '}\n';
        const boundaries: ApexCodeBoundaries = ApexCodeBoundaries.forApexCode(apexCode);
        expect(boundaries.getClassStartLines()).toEqual([1]);
        expect(boundaries.getClassEndLines()).toEqual([6]);
        expect(boundaries.getMethodStartLines()).toEqual([2,5]);
        expect(boundaries.getMethodEndLines()).toEqual([4,5]);
    });

    it('When class open bracket is not on same line as the word "class"', () => {
        const apexCode: string =
            'class MyClass\n' +
            '{ // some comment\n' +
            '/*another comment*/ } // and another';
        const boundaries: ApexCodeBoundaries = ApexCodeBoundaries.forApexCode(apexCode);
        expect(boundaries.getClassStartLines()).toEqual([0]);
        expect(boundaries.getClassEndLines()).toEqual([2]);
        expect(boundaries.getMethodStartLines()).toEqual([]);
        expect(boundaries.getMethodEndLines()).toEqual([]);
    })

    it('When method starts and ends on the same line', () => {
        const apexCode: string =
            'public CLASS MyClass {\n' + // Sanity check that case does not matter
            '    public void doSomething() { if(3==3) { /* do nothing */ }}\n' +
            '}';
        const boundaries: ApexCodeBoundaries = ApexCodeBoundaries.forApexCode(apexCode);
        expect(boundaries.getClassStartLines()).toEqual([0]);
        expect(boundaries.getClassEndLines()).toEqual([2]);
        expect(boundaries.getMethodStartLines()).toEqual([1]);
        expect(boundaries.getMethodEndLines()).toEqual([1]);
    });

    it('When there is an inner class and there is commented out code', () => {
        const apexCode: string =
            'global class MyClass {\n' +
            '    public class InnerClass {\n' +
            '        public String hello() {\n' +
            '           return \'has class in this string\';\n' +
            '        } // this comment has the world class as well\n' +
            '    }\n' +
            '}\n' +
            '/*\n' +
            'global class CommentedOutClass{\n' +
            '}\n' +
            '*/'
        const boundaries: ApexCodeBoundaries = ApexCodeBoundaries.forApexCode(apexCode);
        expect(boundaries.getClassStartLines()).toEqual([0,1]);
        expect(boundaries.getClassEndLines()).toEqual([5,6]);
        expect(boundaries.getMethodStartLines()).toEqual([2]);
        expect(boundaries.getMethodEndLines()).toEqual([4]);
    });

    it('When method arguments span multiple lines, then still get method start lines correct', () => {
        const apexCode: string =
            'public class MyClass {\n' +
            '    public void doSomething(\n' +
            '        Integer a,\n' +
            '        String b\n' +
            '    )\n' +
            '    {\n' +
            '        if(3==3) {\n' +
            '             System.debug(\'ok\');\n' +
            '        }\n' +
            '    }\n' +
            '}';
        const boundaries: ApexCodeBoundaries = ApexCodeBoundaries.forApexCode(apexCode);
        expect(boundaries.getClassStartLines()).toEqual([0]);
        expect(boundaries.getClassEndLines()).toEqual([10]);
        expect(boundaries.getMethodStartLines()).toEqual([1]);
        expect(boundaries.getMethodEndLines()).toEqual([9]);
    });
});


describe('Tests for the makeBlankAllCommentsAndStringsFromApexCode helper function', () => {
    it('should do nothing if there are no comments or strings', () => {
        const apexCode: string =
            'public class MyClass {\n' +
            '    public void doSomething() {}\n' +
            '}';
        const actual: string =  makeBlankAllCommentsAndStringsFromApexCode(apexCode);
        expect(actual).toEqual(apexCode);
    });

    it('should make blank the regular // comment text on its own line', () => {
        const apexCode: string =
            '// hello world\n' +
            'public class MyClass {\n' +
            '    // This is a single-line comment\n' +
            '    public void doSomething() {}\n' +
            '}';
        const actual: string =  makeBlankAllCommentsAndStringsFromApexCode(apexCode);

        const expected: string =
            '              \n' +
            'public class MyClass {\n' +
            '                                    \n' +
            '    public void doSomething() {}\n' +
            '}';
        expect(actual).toEqual(expected);
    });

    it('should make blank the multi-line comment /* ... */ text on one line', () => {
        const apexCode: string =
            'public class MyClass {\n' +
            '    /* This is a one-line multi-line comment */\n' +
            '    public void doSomething() {}\r\n' +
            '}';
        const actual: string =  makeBlankAllCommentsAndStringsFromApexCode(apexCode);

        const expected: string =
            'public class MyClass {\n' +
            '                                               \n' +
            '    public void doSomething() {}\r\n' +
            '}';
        expect(actual).toEqual(expected);
    });

    it('should make blank the multi-line comment /* ... */ text spanning multiple lines', () => {
        const apexCode: string =
            'public class MyClass {\n' +
            '    /* This is a \n' +
            '       multi-line comment\r\n' +
            '       spanning multiple lines */ \n' +
            '    public void doSomething() {}\n' +
            '}';
        const actual: string =  makeBlankAllCommentsAndStringsFromApexCode(apexCode);

        const expected: string =
            'public class MyClass {\n' +
            '                 \n' +
            '                         \r\n' +
            '                                  \n' +
            '    public void doSomething() {}\n' +
            '}';
        expect(actual).toEqual(expected);
    });

    it('should make blank the regular comment text after code on the same line', () => {
        const apexCode: string =
            'public class MyClass {\n' +
            '    public void doSomething() { // This is an inline comment }\n' +
            '} // and this is another comment';
        const actual: string =  makeBlankAllCommentsAndStringsFromApexCode(apexCode);

        const expected: string =
            'public class MyClass {\n' +
            '    public void doSomething() {                               \n' +
            '}                               ';
        expect(actual).toEqual(expected);
    });

    it('should make blank the multi-line comment text after code on the same line', () => {
        const apexCode: string =
            'public class MyClass {\n' +
            '    public void doSomething() { /* This is an inline multi-line comment */ }\n' +
            '}';
        const actual: string =  makeBlankAllCommentsAndStringsFromApexCode(apexCode);

        const expected: string =
            'public class MyClass {\n' +
            '    public void doSomething() {                                            }\n' +
            '}';
        expect(actual).toEqual(expected);
    });

    it('should make blank the multi-line comment text that starts after some code and spans multiple lines', () => {
        const apexCode: string =
            'public class MyClass {\n' +
            '    public void doSomething() { /* This is an inline multi-line \n' +
            'comment */    }\n' +
            '}';
        const actual: string =  makeBlankAllCommentsAndStringsFromApexCode(apexCode);

        const expected: string =
            'public class MyClass {\n' +
            '    public void doSomething() {                                 \n' +
            '              }\n' +
            '}';
        expect(actual).toEqual(expected);
    });

    it('should make blank a string even if it has a comment inside it', () => {
        const apexCode: string =
            'public class MyClass {\n' +
            '    public void doSomething() {\n' +
            '        String str = \'This is not a comment // This is just part of a string\';\n' +
            '    }\n' +
            '}';
        const actual: string =  makeBlankAllCommentsAndStringsFromApexCode(apexCode);

        const expected: string =
            'public class MyClass {\n' +
            '    public void doSomething() {\n' +
            '        String str = \'                                                      \';\n' +
            '    }\n' +
            '}';
        expect(actual).toEqual(expected);
    });

    it('should make blank a string even if it has a multi-line comment in it', () => {
        const apexCode: string =
            'public class MyClass {\n' +
            '    public void doSomething() {\n' +
            '        String str = \'This is not a comment /* This is just part of a string */\';\n' +
            '    }\n' +
            '}';
        const actual: string =  makeBlankAllCommentsAndStringsFromApexCode(apexCode);

        const expected: string =
            'public class MyClass {\n' +
            '    public void doSomething() {\n' +
            '        String str = \'                                                         \';\n' +
            '    }\n' +
            '}';
        expect(actual).toEqual(expected);
    });

    it('should make blank a string and a comment text even if on same line', () => {
        const apexCode: string =
            'public class MyClass {\n' +
            '    public void doSomething() {\n' +
            '        String str = \'This is a string with a // comment in /* in it */\'; // This is an actual comment\n' +
            '    }\n' +
            '}';
        const actual: string =  makeBlankAllCommentsAndStringsFromApexCode(apexCode);

        const expected: string =
            'public class MyClass {\n' +
            '    public void doSomething() {\n' +
            '        String str = \'                                                 \';                             \n' +
            '    }\n' +
            '}';
        expect(actual).toEqual(expected);
    });
});
