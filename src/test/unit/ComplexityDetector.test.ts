import { ComplexityDetector } from '../../performance/ComplexityDetector';

describe('ComplexityDetector', () => {
    let detector: ComplexityDetector;

    beforeEach(() => {
        detector = new ComplexityDetector();
    });

    test('should detect O(1) for no loops', () => {
        const code = `
            function add(a, b) {
                return a + b;
            }
        `;
        expect(detector.detectTimeComplexity(code)).toBe('O(1)');
    });

    test('should detect O(n) for single loop', () => {
        const code = `
            function sum(arr) {
                let s = 0;
                for (let i = 0; i < arr.length; i++) {
                    s += arr[i];
                }
                return s;
            }
        `;
        expect(detector.detectTimeComplexity(code)).toBe('O(n)');
    });

    test('should detect O(n^2) for nested loops', () => {
        const code = `
            function bubbleSort(arr) {
                for (let i = 0; i < arr.length; i++) {
                    for (let j = 0; j < arr.length - i - 1; j++) {
                        if (arr[j] > arr[j+1]) {
                            [arr[j], arr[j+1]] = [arr[j+1], arr[j]];
                        }
                    }
                }
                return arr;
            }
        `;
        expect(detector.detectTimeComplexity(code)).toBe('O(n^2)');
    });

    test('should detect recursion', () => {
        const code = `
            function fib(n) {
                if (n <= 1) return n;
                return fib(n-1) + fib(n-2);
            }
        `;
        expect(detector.detectTimeComplexity(code)).toContain('O(2^n)');
    });

    test('should detect O(n) space for array initialization in loop', () => {
        const code = `
            function collect(n) {
                let res = [];
                for (let i = 0; i < n; i++) {
                    res.push(i);
                }
                return res;
            }
        `;
        expect(detector.detectSpaceComplexity(code)).toContain('O(n)');
    });
});
