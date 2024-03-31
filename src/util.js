/**
 * 
 * @param {string} paramName
 * @returns {string | undefined}
 */
export function getUrlSearchParam(paramName)
{
    let paramList = location.search.slice(1).split("&");
    for (let o of paramList)
    {
        if (o.startsWith(paramName + "="))
        {
            return decodeURIComponent(o.slice(paramName.length + 1));
        }
    }
    return undefined;
}