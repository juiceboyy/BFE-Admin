/**
 * js/utils/date.js
 * Bevat datum-gerelateerde hulpfuncties voor de boekhouding.
 */

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
export const MONTH_NAMES_DUTCH = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

// Default to previous month. Set date to 1st to avoid edge cases (e.g., March 31 -> Feb 31 -> March 3).
let globalTargetDate = new Date();
globalTargetDate.setDate(1); 
globalTargetDate.setMonth(globalTargetDate.getMonth() - 1); 

const periodChangeListeners = [];

export const onPeriodChange = (callback) => {
    if (typeof callback === 'function') {
        periodChangeListeners.push(callback);
    }
};

export const setGlobalTargetDate = (dateObj) => { 
    globalTargetDate = dateObj; 
    periodChangeListeners.forEach(fn => {
        try {
            fn(globalTargetDate);
        } catch (e) {
            console.error('Error in onPeriodChange listener:', e);
        }
    });
    window.dispatchEvent(new CustomEvent('bfe:period-change', { detail: { date: globalTargetDate } }));
};
export const getGlobalTargetDate = () => globalTargetDate;

export function getTargetDateInfo(mode = 'inkoop') {
    const targetMonthIndex = globalTargetDate.getMonth();
    const targetYear = globalTargetDate.getFullYear();

    const prevMonthIndex = targetMonthIndex === 0 ? 11 : targetMonthIndex - 1;
    const suffix = mode === 'verkoop' ? ' Verkoop' : ' Inkoop';

    return {
        targetSheet: `${MONTH_NAMES[targetMonthIndex]}${suffix}`,
        prevSheet: `${MONTH_NAMES[prevMonthIndex]}${suffix}`,
        targetYear: targetYear,
        targetMonthNum: targetMonthIndex + 1
    };
}

export function isDateValidForPeriod(dateStr, targetYear, targetMonthNum) {
    if (!dateStr) return true;
    const [year, month] = dateStr.split('-');
    return parseInt(year, 10) === targetYear && parseInt(month, 10) === targetMonthNum;
}
