export let storageContext = {
    config: {
        noteDuration: 1435,
        userAudioLatency: 0
    }
};
readConfig();

export function readConfig()
{
    try
    {
        let config = JSON.parse(localStorage.getItem("omo_config"));
        Object.entries(config).forEach(([key, value]) =>
        {
            storageContext.config[key] = value;
        });
    }
    catch (err)
    {
        console.error(err);
    }
}

export function saveConfig()
{
    try
    {
        localStorage.setItem("omo_config", JSON.stringify(storageContext.config));
    }
    catch (err)
    {
        console.error(err);
    }
}