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

    describe('Tests for getStartLineOfClassThatContainsLine', () => {
        it('Should find the class start line for a line inside a simple class', () => {
            const apexCode: string =
                'public class MyClass {\n' +         // line 0
                '    public void doSomething() {\n' + // line 1
                '        // some code\n' +             // line 2
                '    }\n' +                            // line 3
                '}';                                   // line 4
            const boundaries: ApexCodeBoundaries = ApexCodeBoundaries.forApexCode(apexCode);
            
            expect(boundaries.getStartLineOfClassThatContainsLine(0)).toBe(0);
            expect(boundaries.getStartLineOfClassThatContainsLine(1)).toBe(0);
            expect(boundaries.getStartLineOfClassThatContainsLine(2)).toBe(0);
            expect(boundaries.getStartLineOfClassThatContainsLine(3)).toBe(0);
            expect(boundaries.getStartLineOfClassThatContainsLine(4)).toBe(0);
        });

        it('Should find the innermost class start line for nested classes', () => {
            const apexCode: string =
                'public class OuterClass {\n' +              // line 0
                '    public void outerMethod() {\n' +        // line 1
                '        // outer code\n' +                   // line 2
                '    }\n' +                                   // line 3
                '    public class InnerClass {\n' +           // line 4
                '        public void innerMethod() {\n' +     // line 5
                '            // inner code\n' +               // line 6
                '        }\n' +                               // line 7
                '    }\n' +                                   // line 8
                '}';                                          // line 9
            const boundaries: ApexCodeBoundaries = ApexCodeBoundaries.forApexCode(apexCode);
            
            // Lines in outer class only
            expect(boundaries.getStartLineOfClassThatContainsLine(0)).toBe(0);
            expect(boundaries.getStartLineOfClassThatContainsLine(1)).toBe(0);
            expect(boundaries.getStartLineOfClassThatContainsLine(2)).toBe(0);
            expect(boundaries.getStartLineOfClassThatContainsLine(3)).toBe(0);
            
            // Lines in inner class
            expect(boundaries.getStartLineOfClassThatContainsLine(4)).toBe(4);
            expect(boundaries.getStartLineOfClassThatContainsLine(5)).toBe(4);
            expect(boundaries.getStartLineOfClassThatContainsLine(6)).toBe(4);
            expect(boundaries.getStartLineOfClassThatContainsLine(7)).toBe(4);
            expect(boundaries.getStartLineOfClassThatContainsLine(8)).toBe(4);
            
            // Line at outer class end (closing brace of OuterClass)
            expect(boundaries.getStartLineOfClassThatContainsLine(9)).toBe(0);
        });

        it('Should return undefined for a line not in any class', () => {
            const apexCode: string =
                '// Some comment\n' +                        // line 0
                'public class MyClass {\n' +                 // line 1
                '    public void doSomething() {}\n' +       // line 2
                '}';                                         // line 3
            const boundaries: ApexCodeBoundaries = ApexCodeBoundaries.forApexCode(apexCode);
            
            expect(boundaries.getStartLineOfClassThatContainsLine(0)).toBeUndefined();
            expect(boundaries.getStartLineOfClassThatContainsLine(1)).toBe(1);
            expect(boundaries.getStartLineOfClassThatContainsLine(2)).toBe(1);
            expect(boundaries.getStartLineOfClassThatContainsLine(3)).toBe(1);
        });
    });

    describe('Tests for getEndLineOfClassThatContainsLine', () => {
        it('Should find the class end line for a line inside a simple class', () => {
            const apexCode: string =
                'public class MyClass {\n' +         // line 0
                '    public void doSomething() {\n' + // line 1
                '        // some code\n' +             // line 2
                '    }\n' +                            // line 3
                '}';                                   // line 4
            const boundaries: ApexCodeBoundaries = ApexCodeBoundaries.forApexCode(apexCode);
            
            expect(boundaries.getEndLineOfClassThatContainsLine(0)).toBe(4);
            expect(boundaries.getEndLineOfClassThatContainsLine(1)).toBe(4);
            expect(boundaries.getEndLineOfClassThatContainsLine(2)).toBe(4);
            expect(boundaries.getEndLineOfClassThatContainsLine(3)).toBe(4);
            expect(boundaries.getEndLineOfClassThatContainsLine(4)).toBe(4);
        });

        it('Should find the correct end line for nested classes', () => {
            const apexCode: string =
                'public class OuterClass {\n' +              // line 0
                '    public void outerMethod() {\n' +        // line 1
                '        // outer code\n' +                   // line 2
                '    }\n' +                                   // line 3
                '    public class InnerClass {\n' +           // line 4
                '        public void innerMethod() {\n' +     // line 5
                '            // inner code\n' +               // line 6
                '        }\n' +                               // line 7
                '    }\n' +                                   // line 8
                '}';                                          // line 9
            const boundaries: ApexCodeBoundaries = ApexCodeBoundaries.forApexCode(apexCode);
            
            // Lines in outer class only
            expect(boundaries.getEndLineOfClassThatContainsLine(0)).toBe(9);
            expect(boundaries.getEndLineOfClassThatContainsLine(1)).toBe(9);
            expect(boundaries.getEndLineOfClassThatContainsLine(2)).toBe(9);
            expect(boundaries.getEndLineOfClassThatContainsLine(3)).toBe(9);
            
            // Lines in inner class
            expect(boundaries.getEndLineOfClassThatContainsLine(4)).toBe(8);
            expect(boundaries.getEndLineOfClassThatContainsLine(5)).toBe(8);
            expect(boundaries.getEndLineOfClassThatContainsLine(6)).toBe(8);
            expect(boundaries.getEndLineOfClassThatContainsLine(7)).toBe(8);
            expect(boundaries.getEndLineOfClassThatContainsLine(8)).toBe(8);
            
            // Line at outer class end (correctly identifies it's in OuterClass)
            expect(boundaries.getEndLineOfClassThatContainsLine(9)).toBe(9);
        });

        it('Should handle deeply nested classes correctly', () => {
            const apexCode: string =
                'public class Outer {\n' +              // line 0
                '    public class Inner1 {\n' +          // line 1
                '        public class Inner2 {\n' +      // line 2
                '            void deepMethod() {}\n' +   // line 3
                '        }\n' +                          // line 4
                '    }\n' +                              // line 5
                '}';                                     // line 6
            const boundaries: ApexCodeBoundaries = ApexCodeBoundaries.forApexCode(apexCode);
            
            expect(boundaries.getEndLineOfClassThatContainsLine(0)).toBe(6);
            expect(boundaries.getEndLineOfClassThatContainsLine(1)).toBe(5);
            expect(boundaries.getEndLineOfClassThatContainsLine(2)).toBe(4);
            expect(boundaries.getEndLineOfClassThatContainsLine(3)).toBe(4);
            expect(boundaries.getEndLineOfClassThatContainsLine(4)).toBe(4);
            expect(boundaries.getEndLineOfClassThatContainsLine(5)).toBe(5); // Closing brace of Inner1
            expect(boundaries.getEndLineOfClassThatContainsLine(6)).toBe(6); // Closing brace of Outer
        });

        it('Should return undefined for a line not in any class', () => {
            const apexCode: string =
                '// Some comment\n' +                        // line 0
                'public class MyClass {\n' +                 // line 1
                '    public void doSomething() {}\n' +       // line 2
                '}';                                         // line 3
            const boundaries: ApexCodeBoundaries = ApexCodeBoundaries.forApexCode(apexCode);
            
            expect(boundaries.getEndLineOfClassThatContainsLine(0)).toBeUndefined();
            expect(boundaries.getEndLineOfClassThatContainsLine(1)).toBe(3);
            expect(boundaries.getEndLineOfClassThatContainsLine(2)).toBe(3);
            expect(boundaries.getEndLineOfClassThatContainsLine(3)).toBe(3);
        });
    });
});
