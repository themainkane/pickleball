import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    findGenderColumn,
    LADIES_FIXTURE_MIN_WOMEN,
    makeupRank,
    pairMakeup,
    parseGenders,
    readGender,
    resolveGenders,
    splitNameAndGender
} from './Genders';

const format = (name: string) => {
    const names = name.split(' ');
    return names.length === 1
        ? names[0]!
        : `${names[0]} ${names[names.length - 1]!.charAt(0).toUpperCase()}`;
};

describe('Genders', () => {
    describe('parsing the genders argument', () => {
        it('reads entries separated by ; , or a new line', () => {
            assert.deepEqual(
                parseGenders('Cherie Marais: F; Joe Kane = M\nGrace Kemp: f'),
                [
                    { player: 'Cherie Marais', gender: 'F' },
                    { player: 'Joe Kane', gender: 'M' },
                    { player: 'Grace Kemp', gender: 'F' }
                ]
            );
        });

        it('reads structured input from the API', () => {
            assert.deepEqual(parseGenders({ 'Joe Kane': 'M' }), [{ player: 'Joe Kane', gender: 'M' }]);
            assert.deepEqual(parseGenders([['Joe Kane', 'M']]), [{ player: 'Joe Kane', gender: 'M' }]);
        });

        it('reads nothing from an empty argument', () => {
            assert.deepEqual(parseGenders(''), []);
            assert.deepEqual(parseGenders(undefined), []);
        });

        it('rejects anything that is not M or F', () => {
            assert.throws(() => parseGenders('Joe Kane: male'), /Use M or F/);
            assert.throws(() => parseGenders('Joe Kane'), /missing/);
        });
    });

    describe('matching declared genders to the roster', () => {
        const players = ['Cherie M', 'Joe K'];

        it('matches a loosely typed name', () => {
            assert.deepEqual(
                resolveGenders(parseGenders('cherie marais: F'), players, format),
                [{ player: 'Cherie M', gender: 'F' }]
            );
        });

        it('allows the same player twice when the genders agree', () => {
            assert.deepEqual(
                resolveGenders(parseGenders('Joe Kane: M; joe k: M'), players, format),
                [{ player: 'Joe K', gender: 'M' }]
            );
        });

        it('refuses to guess between two different genders for one player', () => {
            assert.throws(
                () => resolveGenders(parseGenders('Joe Kane: M; joe k: F'), players, format),
                /two different genders/
            );
        });

        it('says so when the named player is not playing', () => {
            assert.throws(() => resolveGenders(parseGenders('Nobody: F'), players, format), /not found/);
        });
    });

    describe('gender written after a name', () => {
        it('reads the bracketed, piped and dashed forms', () => {
            assert.deepEqual(splitNameAndGender('Cherie Marais (F)'), { name: 'Cherie Marais', gender: 'F' });
            assert.deepEqual(splitNameAndGender('Cherie Marais [f]'), { name: 'Cherie Marais', gender: 'F' });
            assert.deepEqual(splitNameAndGender('Joe Kane | M'), { name: 'Joe Kane', gender: 'M' });
            assert.deepEqual(splitNameAndGender('Joe Kane - m'), { name: 'Joe Kane', gender: 'M' });
        });

        it('leaves a name with no gender alone', () => {
            assert.deepEqual(splitNameAndGender('Joe Kane'), { name: 'Joe Kane' });
        });

        it('leaves a suffix that is not a gender as part of the name', () => {
            assert.deepEqual(splitNameAndGender('Joe Kane (captain)'), { name: 'Joe Kane (captain)' });
            assert.deepEqual(splitNameAndGender('Marais, Cherie'), { name: 'Marais, Cherie' });
        });
    });

    describe('finding a gender column in a sheet', () => {
        it('takes the column beside the roster', () => {
            assert.equal(findGenderColumn(['05/10/26', 'Gender', '12/10/26', 'M/F'], 2), 3);
        });

        it('takes a column named after the date', () => {
            assert.equal(findGenderColumn(['05/10/26', '12/10/26', '12/10/26 Gender'], 1), 2);
        });

        it('takes a lone gender column shared by the sheet', () => {
            assert.equal(findGenderColumn(['Gender', '05/10/26', '12/10/26'], 2), 0);
        });

        it('takes none when there is nothing to take, or the choice is ambiguous', () => {
            assert.equal(findGenderColumn(['05/10/26', '12/10/26'], 1), -1);
            assert.equal(findGenderColumn(['Gender', '05/10/26', 'Sex', '12/10/26'], 3), -1);
        });
    });

    describe('reading a single value', () => {
        it('reads only M and F', () => {
            assert.equal(readGender('m'), 'M');
            assert.equal(readGender(' F '), 'F');
            assert.equal(readGender('female'), undefined);
            assert.equal(readGender(''), undefined);
            assert.equal(readGender(undefined), undefined);
        });
    });

    describe('what a pair adds up to', () => {
        it('names the makeup', () => {
            assert.equal(pairMakeup('F', 'F'), 'ladies');
            assert.equal(pairMakeup('M', 'F'), 'mixed');
            assert.equal(pairMakeup('F', 'M'), 'mixed');
            assert.equal(pairMakeup('M', 'M'), 'mens');
        });

        it('treats a pair with an unknown gender as unknown', () => {
            assert.equal(pairMakeup('F', undefined), 'unknown');
            assert.equal(pairMakeup(undefined, undefined), 'unknown');
        });

        it('ranks ladies and mixed ahead of mens and unknown', () => {
            assert.ok(makeupRank('ladies') < makeupRank('mixed'));
            assert.ok(makeupRank('mixed') < makeupRank('mens'));
            assert.ok(makeupRank('mens') < makeupRank('unknown'));
        });
    });

    it('needs four women for a ladies fixture', () => {
        assert.equal(LADIES_FIXTURE_MIN_WOMEN, 4);
    });
});
