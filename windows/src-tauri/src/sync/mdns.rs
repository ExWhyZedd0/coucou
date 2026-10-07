// mDNS advertisement for Coucou LAN discovery (_coucou._tcp.local).

use mdns_sd::{ServiceDaemon, ServiceInfo};
use std::collections::HashMap;

pub struct MdnsAdvertiser {
    daemon: Option<ServiceDaemon>,
    service_fullname: Option<String>,
}

impl MdnsAdvertiser {
    pub fn new() -> Self {
        Self {
            daemon: None,
            service_fullname: None,
        }
    }

    /// Registers `_coucou._tcp.local.` service with the given host, port, and properties.
    pub fn register(
        &mut self,
        instance_name: &str,
        lan_ip: &str,
        port: u16,
        properties: HashMap<String, String>,
    ) -> Result<(), String> {
        self.unregister();

        let daemon = ServiceDaemon::new().map_err(|e| format!("cannot create mdns daemon: {e}"))?;
        let service_type = "_coucou._tcp.local.";
        let clean_host: String = instance_name
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
            .collect();
        let trimmed = clean_host.trim_matches('-');
        let host_name = format!("{}.local.", if trimmed.is_empty() { "coucou-pc" } else { trimmed });

        let mut prop_map = HashMap::new();
        for (k, v) in properties {
            prop_map.insert(k, v);
        }

        let my_service = ServiceInfo::new(
            service_type,
            instance_name,
            &host_name,
            lan_ip,
            port,
            prop_map,
        )
        .map_err(|e| format!("invalid mdns service info: {e}"))?;

        let fullname = my_service.get_fullname().to_string();
        daemon
            .register(my_service)
            .map_err(|e| format!("cannot register mdns service: {e}"))?;

        self.daemon = Some(daemon);
        self.service_fullname = Some(fullname);
        Ok(())
    }

    pub fn unregister(&mut self) {
        if let (Some(daemon), Some(fullname)) = (self.daemon.take(), self.service_fullname.take()) {
            let _ = daemon.unregister(&fullname);
            let _ = daemon.shutdown();
        }
    }
}

impl Drop for MdnsAdvertiser {
    fn drop(&mut self) {
        self.unregister();
    }
}
